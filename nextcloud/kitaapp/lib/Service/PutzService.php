<?php

declare(strict_types=1);

namespace OCA\KitaApp\Service;

use OCA\DAV\CalDAV\CalDavBackend;
use OCP\IAppConfig;
use OCP\IURLGenerator;
use OCP\IUser;
use OCP\Mail\IMailer;
use Psr\Log\LoggerInterface;
use Sabre\VObject\Reader;

/**
 * Putzdienst-Tausch. Die Eltern haben im Kalender „Putzdienst“ nur Leserechte; geschrieben wird hier,
 * auf dem Server, und nur nach Bestätigung durch beide Familien.
 *
 * Eine Anfrage tauscht zwei Familiennamen in den Terminen („Putzdienst: Muster (Putzmittel: X)“).
 * Das Putzmittel bleibt an der Woche. Nichts wird gelöscht; ein Tausch lässt sich 48 Stunden lang zurücknehmen.
 */
class PutzService {
	public const TTL_DAYS = 5;      // so lange wartet eine Anfrage auf Antwort
	public const UNDO_HOURS = 48;   // so lange ist „Rückgängig“ möglich

	public function __construct(
		private string $appName,
		private IAppConfig $config,
		private CalDavBackend $calendars,
		private IMailer $mailer,
		private IURLGenerator $urls,
		private LoggerInterface $logger,
		private OrgSettings $org,
	) {
	}

	// ---------- Familien ----------

	/** @return array<string,string[]> Familienname => E-Mail-Adressen (Einstellung „families“) */
	public function families(): array {
		$map = json_decode($this->config->getValueString($this->appName, 'families', '{}'), true);
		return is_array($map) ? $map : [];
	}

	/** Familie eines Nutzers: erst über die E-Mail-Adresse, ersatzweise über den Anzeigenamen. */
	public function familyOf(IUser $user): ?string {
		$mail = strtolower(trim((string)$user->getEMailAddress()));
		$families = $this->families();
		if ($mail !== '') {
			foreach ($families as $name => $addresses) {
				if (in_array($mail, array_map('strtolower', $addresses), true)) {
					return (string)$name;
				}
			}
		}
		foreach ($families as $name => $_) {
			if (stripos($user->getDisplayName(), (string)$name) !== false) {
				return (string)$name;
			}
		}
		return null;
	}

	// ---------- Kalender ----------

	private function calendarId(): int {
		return $this->config->getValueInt($this->appName, 'putz_calendar', 8);
	}

	private function today(): string {
		return (new \DateTimeImmutable('today', new \DateTimeZone('Europe/Berlin')))->format('Y-m-d');
	}

	/** @return array<string,array{uri:string,date:string,family:string,note:string}> nach Objekt-Adresse */
	private function duties(): array {
		$out = [];
		$id = $this->calendarId();
		foreach ($this->calendars->getCalendarObjects($id) as $row) {
			$obj = $this->calendars->getCalendarObject($id, $row['uri']);
			if (!$obj) {
				continue;
			}
			try {
				$ev = Reader::read($obj['calendardata'])->VEVENT ?? null;
			} catch (\Throwable $e) {
				continue;
			}
			if (!$ev || !isset($ev->DTSTART)) {
				continue;
			}
			$summary = trim((string)$ev->SUMMARY);
			if (!preg_match('/^Putzdienst\s*:\s*(.*)$/isu', $summary, $m)) {
				continue;
			}
			$rest = trim($m[1]);
			$family = trim(preg_split('/\s*\(/u', $rest, 2)[0]);
			$note = preg_match('/\((.*)\)/su', $rest, $n) ? $n[1] : '';
			$date = $ev->DTSTART->getDateTime(new \DateTimeZone('Europe/Berlin'))->format('Y-m-d');
			$out[$row['uri']] = ['uri' => $row['uri'], 'date' => $date, 'family' => $family, 'note' => $note];
		}
		uasort($out, fn ($a, $b) => strcmp($a['date'], $b['date']));
		return $out;
	}

	/** Familienname im Termin ersetzen; der Rest („(Putzmittel: …)“) bleibt unberührt. */
	private function rename(string $uri, string $from, string $to): void {
		$id = $this->calendarId();
		$obj = $this->calendars->getCalendarObject($id, $uri);
		if (!$obj) {
			throw new \RuntimeException('Termin nicht gefunden');
		}
		$cal = Reader::read($obj['calendardata']);
		$ev = $cal->VEVENT;
		$new = preg_replace('/^(Putzdienst\s*:\s*)' . preg_quote($from, '/') . '/iu', '${1}' . addcslashes($to, '\\$'), (string)$ev->SUMMARY, 1, $count);
		if ($count !== 1) {
			throw new \RuntimeException('Familie im Termin nicht gefunden');
		}
		$ev->SUMMARY = $new;
		$ev->{'LAST-MODIFIED'} = new \DateTimeImmutable('now', new \DateTimeZone('UTC'));
		$ev->SEQUENCE = (int)(string)($ev->SEQUENCE ?? 0) + 1;
		$this->calendars->updateCalendarObject($id, $uri, $cal->serialize());
	}

	// ---------- Anfragen (Speicher: eine JSON-Liste in den App-Einstellungen) ----------

	private function load(): array {
		$list = json_decode($this->config->getValueString($this->appName, 'swaps', '[]'), true);
		return is_array($list) ? $list : [];
	}

	private function save(array $list): void {
		// erledigte Anfragen nach 60 Tagen vergessen
		$cut = time() - 60 * 86400;
		$list = array_values(array_filter($list, fn ($s) => $s['status'] === 'pending' || ($s['updated'] ?? $s['created']) > $cut));
		$this->config->setValueString($this->appName, 'swaps', json_encode($list, JSON_UNESCAPED_UNICODE));
	}

	/** Verhindert, dass zwei gleichzeitige Anfragen sich gegenseitig überschreiben. */
	private function locked(callable $fn) {
		$fh = fopen(sys_get_temp_dir() . '/kitaapp-putz.lock', 'c');
		flock($fh, LOCK_EX);
		try {
			return $fn();
		} finally {
			flock($fh, LOCK_UN);
			fclose($fh);
		}
	}

	/** Offene Anfragen verfallen, wenn sie zu alt sind oder einer der Termine schon begonnen hat. */
	private function expire(array $list, array $duties): array {
		$today = $this->today();
		foreach ($list as &$s) {
			if ($s['status'] !== 'pending') {
				continue;
			}
			$old = $s['created'] + self::TTL_DAYS * 86400 < time();
			$started = ($duties[$s['a']['uri']]['date'] ?? '0') <= $today || ($duties[$s['b']['uri']]['date'] ?? '0') <= $today;
			if ($old || $started) {
				$s['status'] = 'expired';
				$s['updated'] = time();
			}
		}
		return $list;
	}

	// ---------- Schnittstelle für die App ----------

	/**
	 * Dienst der Familie, der gerade läuft: ab 3 Tage vor dem Start bis zum Ende der Woche danach
	 * (Putzwoche Freitag–Donnerstag, danach Reinigungs- und Einkaufsdienst). Nur dann gehen die
	 * Links zur Aufgabenliste (mit Zahlenschloss-Codes) und zur Checkliste an die App.
	 */
	private function current(string $fam, array $duties, string $today): ?array {
		foreach ($duties as $d) {
			if ($d['family'] !== $fam) {
				continue;
			}
			$start = new \DateTimeImmutable($d['date']);
			$from = $start->modify('-3 days')->format('Y-m-d');
			$to = $start->modify('+13 days')->format('Y-m-d');
			if ($today < $from || $today > $to) {
				continue;
			}
			$mittel = preg_match('/Putzmittel:\s*(\S+)/u', $d['note'], $m) ? $m[1] : '';
			return [
				'date' => $d['date'],
				'until' => $start->modify('+6 days')->format('Y-m-d'),
				'phase' => $today < $d['date'] ? 'soon' : ($today <= $start->modify('+6 days')->format('Y-m-d') ? 'week' : 'after'),
				'putzmittel' => $mittel,
				'tasksUrl' => $this->config->getValueString($this->appName, 'putz_tasks_url', ''),
				'checklistUrl' => $this->config->getValueString($this->appName, 'putz_checklist_url', ''),
			];
		}
		return null;
	}

	public function state(IUser $user): array {
		$fam = $this->familyOf($user);
		if ($fam === null) {
			return ['family' => null, 'current' => null, 'duties' => [], 'incoming' => [], 'outgoing' => [], 'recent' => []];
		}
		return $this->locked(function () use ($fam) {
			$duties = $this->duties();
			$list = $this->expire($this->load(), $duties);
			$this->save($list);
			$today = $this->today();
			$busy = [];
			foreach ($list as $s) {
				if ($s['status'] === 'pending') {
					$busy[$s['a']['uri']] = $busy[$s['b']['uri']] = true;
				}
			}
			$view = fn (array $s) => [
				'id' => $s['id'], 'a' => $s['a'], 'b' => $s['b'], 'message' => $s['message'],
				'created' => $s['created'], 'expires' => $s['created'] + self::TTL_DAYS * 86400,
				'undoUntil' => ($s['accepted'] ?? 0) + self::UNDO_HOURS * 3600,
			];
			$mine = fn (array $s) => $s['a']['family'] === $fam || $s['b']['family'] === $fam;
			return [
				'family' => $fam,
				'current' => $this->current($fam, $duties, $today),
				'duties' => array_values(array_map(fn ($d) => $d + [
					'mine' => $d['family'] === $fam,
					'busy' => isset($busy[$d['uri']]),
					'swappable' => $d['date'] > $today,
				], array_filter($duties, fn ($d) => $d['date'] > $today))),
				'incoming' => array_values(array_map($view, array_filter($list, fn ($s) => $s['status'] === 'pending' && $s['b']['family'] === $fam))),
				'outgoing' => array_values(array_map($view, array_filter($list, fn ($s) => $s['status'] === 'pending' && $s['a']['family'] === $fam))),
				'recent' => array_values(array_map($view, array_filter($list, fn ($s) => $s['status'] === 'accepted' && $mine($s) && ($s['accepted'] + self::UNDO_HOURS * 3600) > time()))),
			];
		});
	}

	public function create(IUser $user, string $myUri, string $theirUri, string $message): void {
		$fam = $this->familyOf($user) ?? throw new \InvalidArgumentException('Wir finden deine Familie nicht. ' . $this->org->helpHint() . '.');
		$this->locked(function () use ($fam, $myUri, $theirUri, $message) {
			$duties = $this->duties();
			$list = $this->expire($this->load(), $duties);
			$a = $duties[$myUri] ?? null;
			$b = $duties[$theirUri] ?? null;
			$today = $this->today();
			if (!$a || !$b || $a['family'] !== $fam || $b['family'] === $fam || $a['date'] <= $today || $b['date'] <= $today) {
				throw new \InvalidArgumentException('Dieser Tausch ist nicht möglich. Es geht nur dein eigener, noch nicht begonnener Dienst gegen den einer anderen Familie.');
			}
			foreach ($list as $s) {
				if ($s['status'] === 'pending' && array_intersect([$s['a']['uri'], $s['b']['uri']], [$myUri, $theirUri])) {
					throw new \InvalidArgumentException('Für einen dieser Termine läuft schon eine Tauschanfrage.');
				}
			}
			$swap = [
				'id' => bin2hex(random_bytes(6)), 'status' => 'pending', 'created' => time(), 'updated' => time(),
				'a' => $a, 'b' => $b, 'message' => mb_substr(trim($message), 0, 300),
			];
			$list[] = $swap;
			$this->save($list);
			$this->mailFamily($b['family'], 'Putzdienst-Tausch: Anfrage von Familie ' . $a['family'],
				"Hallo Familie {$b['family']},\n\nFamilie {$a['family']} möchte den Putzdienst tauschen:\n\n"
				. "  Ihr übernehmt:  {$this->de($a['date'])} (bisher {$a['family']})\n"
				. "  Ihr gebt ab:    {$this->de($b['date'])}\n"
				. ($swap['message'] !== '' ? "\nNachricht: {$swap['message']}\n" : '')
				. "\nBitte antwortet in der KiTa-App: {$this->link()}\nDie Anfrage gilt " . self::TTL_DAYS . " Tage.\n");
		});
	}

	public function respond(IUser $user, string $id, string $action): void {
		$fam = $this->familyOf($user) ?? throw new \InvalidArgumentException('Wir finden deine Familie nicht.');
		$this->locked(function () use ($fam, $id, $action) {
			$duties = $this->duties();
			$list = $this->expire($this->load(), $duties);
			$i = array_search($id, array_column($list, 'id'), true);
			if ($i === false) {
				throw new \InvalidArgumentException('Diese Anfrage gibt es nicht mehr.');
			}
			$s = &$list[$i];
			[$a, $b] = [$s['a'], $s['b']];
			$now = time();
			switch ($action) {
				case 'accept':
					if ($s['status'] === 'accepted' && $b['family'] === $fam) {
						return; // schon erledigt (z. B. doppelt getippt)
					}
					if ($b['family'] !== $fam || $s['status'] !== 'pending') {
						throw new \InvalidArgumentException($s['status'] === 'expired' ? 'Die Anfrage ist abgelaufen.' : 'Diese Anfrage kann nicht mehr angenommen werden.');
					}
					$this->swapNames($duties, $a, $b);
					$s['status'] = 'accepted';
					$s['accepted'] = $now;
					$text = "Der Putzdienst-Tausch ist bestätigt:\n\n  {$a['family']} → {$this->de($b['date'])}\n  {$b['family']} → {$this->de($a['date'])}\n\nDer Kalender „Putzdienst“ ist angepasst, die Erinnerungsmail geht an die neue Familie. "
						. 'Bis ' . date('d.m. H:i', $now + self::UNDO_HOURS * 3600) . " Uhr kann der Tausch in der KiTa-App zurückgenommen werden: {$this->link()}\n";
					$this->mailFamily($a['family'], 'Putzdienst-Tausch bestätigt', $text);
					$this->mailFamily($b['family'], 'Putzdienst-Tausch bestätigt', $text);
					break;
				case 'decline':
					if ($b['family'] !== $fam || $s['status'] !== 'pending') {
						throw new \InvalidArgumentException('Diese Anfrage kann nicht mehr abgelehnt werden.');
					}
					$s['status'] = 'declined';
					$this->mailFamily($a['family'], 'Putzdienst-Tausch abgelehnt', "Familie {$b['family']} kann den Dienst am {$this->de($b['date'])} leider nicht gegen euren am {$this->de($a['date'])} tauschen. Es ändert sich nichts.\n");
					break;
				case 'cancel':
					if ($a['family'] !== $fam || $s['status'] !== 'pending') {
						throw new \InvalidArgumentException('Diese Anfrage kann nicht mehr zurückgezogen werden.');
					}
					$s['status'] = 'cancelled';
					break;
				case 'undo':
					if ($s['status'] !== 'accepted' || !in_array($fam, [$a['family'], $b['family']], true)) {
						throw new \InvalidArgumentException('Dieser Tausch kann nicht zurückgenommen werden.');
					}
					if ($now > ($s['accepted'] ?? 0) + self::UNDO_HOURS * 3600) {
						throw new \InvalidArgumentException('Die 48 Stunden zum Zurücknehmen sind vorbei.');
					}
					// Termine zurücktauschen: jetzt trägt a-Termin b-Familie und umgekehrt
					$this->swapNames($duties, ['uri' => $a['uri'], 'family' => $b['family']], ['uri' => $b['uri'], 'family' => $a['family']]);
					$s['status'] = 'undone';
					$text = "Der Putzdienst-Tausch wurde zurückgenommen. Es gilt wieder der ursprüngliche Plan ({$a['family']}: {$this->de($a['date'])}, {$b['family']}: {$this->de($b['date'])}).\n";
					$this->mailFamily($a['family'], 'Putzdienst-Tausch zurückgenommen', $text);
					$this->mailFamily($b['family'], 'Putzdienst-Tausch zurückgenommen', $text);
					break;
				default:
					throw new \InvalidArgumentException('Unbekannte Aktion.');
			}
			$s['updated'] = $now;
			$this->save($list);
		});
	}

	/**
	 * Zwei Termine tauschen die Familien. Vorher wird geprüft, dass beide noch so im Kalender stehen
	 * wie in der Anfrage – hat zwischendurch jemand von Hand etwas geändert, passiert nichts.
	 * Schlägt der zweite Schreibvorgang fehl, wird der erste zurückgenommen.
	 */
	private function swapNames(array $duties, array $a, array $b): void {
		$ca = $duties[$a['uri']] ?? null;
		$cb = $duties[$b['uri']] ?? null;
		if (!$ca || !$cb || strcasecmp($ca['family'], $a['family']) !== 0 || strcasecmp($cb['family'], $b['family']) !== 0) {
			throw new \InvalidArgumentException('Der Putzplan wurde zwischenzeitlich geändert. Bitte schaut noch einmal auf den Plan und stellt die Anfrage neu.');
		}
		if ($ca['date'] <= $this->today() || $cb['date'] <= $this->today()) {
			throw new \InvalidArgumentException('Einer der Dienste hat schon begonnen.');
		}
		$this->rename($a['uri'], $a['family'], $b['family']);
		try {
			$this->rename($b['uri'], $b['family'], $a['family']);
		} catch (\Throwable $e) {
			$this->rename($a['uri'], $b['family'], $a['family']);
			$this->logger->error('Putzdienst-Tausch abgebrochen: ' . $e->getMessage(), ['app' => $this->appName]);
			throw new \RuntimeException('Der Kalender konnte nicht geändert werden. Es wurde nichts getauscht.');
		}
	}

	// ---------- Mails ----------

	private function de(string $iso): string {
		$d = new \DateTimeImmutable($iso);
		$wd = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'][(int)$d->format('w')];
		return $wd . ', ' . $d->format('d.m.Y');
	}

	private function link(): string {
		return $this->urls->getAbsoluteURL($this->urls->linkToRoute('kitaapp.page.index')) . '#/putz';
	}

	private function mailFamily(string $family, string $subject, string $body): void {
		$to = $this->families()[$family] ?? [];
		if (!$to) {
			return;
		}
		try {
			$msg = $this->mailer->createMessage();
			$msg->setTo(array_combine($to, array_fill(0, count($to), 'Familie ' . $family)));
			$this->org->applySender($msg);
			$msg->setSubject($subject);
			$msg->setPlainBody($body . "\n" . $this->org->name() . "\n");
			$this->mailer->send($msg);
		} catch (\Throwable $e) {
			$this->logger->warning('Putzdienst-Mail nicht gesendet: ' . $e->getMessage(), ['app' => $this->appName]);
		}
	}
}
