<?php

declare(strict_types=1);

namespace OCA\KitaApp\Service;

use OCP\Files\File;
use OCP\Files\IAppData;
use OCP\Files\IRootFolder;
use OCP\Files\NotFoundException;
use OCP\IAppConfig;
use OCP\IDBConnection;
use OCP\IGroupManager;
use OCP\Http\Client\IClientService;
use OCP\IUser;
use OCP\Mail\IMailer;
use Psr\Log\LoggerInterface;

/**
 * Wochenrückblick für das Kindergartentagebuch. Schreiben dürfen Mitglieder der Gruppen aus der Einstellung
 * diary_groups (Standard „Team-Kita“) und Administratoren. Der Entwurf liegt in den App-Einstellungen; beim
 * Veröffentlichen kommt der Eintrag oben in die Collectives-Seite (Datei-ID diary_page_id) und, wenn gewünscht,
 * geht die Eltern-Mail raus. Vor jeder Änderung wird die Seite im App-Datenordner gesichert.
 */
class DiaryService {
	private const PAGE_ID = 3132;
	private const SEPARATOR = '\\' . '_______________________________________________________________________________________' . '\\_';

	public function __construct(
		private string $appName,
		private IAppConfig $config,
		private IGroupManager $groups,
		private IRootFolder $root,
		private IAppData $appData,
		private IDBConnection $db,
		private IMailer $mailer,
		private LoggerInterface $logger,
		private IClientService $http,
		private OrgSettings $org,
	) {
	}

	public function canWrite(IUser $user): bool {
		if ($this->groups->isAdmin($user->getUID())) {
			return true;
		}
		$names = array_filter(array_map('trim', explode(',', $this->config->getValueString($this->appName, 'diary_groups', 'Team-Kita'))));
		foreach ($names as $g) {
			if ($this->groups->isInGroup($user->getUID(), $g)) {
				return true;
			}
		}
		return false;
	}

	private function requireWriter(IUser $user): void {
		if (!$this->canWrite($user)) {
			throw new \InvalidArgumentException('Den Wochenrückblick schreibt das Team.');
		}
	}

	private function mailTo(): string {
		return $this->config->getValueString($this->appName, 'diary_mail_to', '');
	}

	private function pageUrl(): string {
		return $this->config->getValueString($this->appName, 'diary_url', '');
	}

	/** Titelvorschlag: „Wochenrückblick 26.-30.10.2026“ (Montag bis Freitag; Montag/Dienstag meint die Woche davor). */
	public function suggestedTitle(?\DateTimeImmutable $now = null): string {
		$now ??= new \DateTimeImmutable('now', new \DateTimeZone('Europe/Berlin'));
		$monday = $now->modify('monday this week');
		if ((int)$now->format('N') <= 2) {
			$monday = $monday->modify('-7 days');
		}
		$friday = $monday->modify('+4 days');
		$range = $monday->format('m') === $friday->format('m')
			? $monday->format('d') . '.-' . $friday->format('d.m.Y')
			: $monday->format('d.m.') . '-' . $friday->format('d.m.Y');
		return 'Wochenrückblick ' . $range;
	}

	private function page(): File {
		$id = (int)$this->config->getValueString($this->appName, 'diary_page_id', (string)self::PAGE_ID);
		$nodes = $this->root->getById($id);
		$file = $nodes[0] ?? null;
		if (!$file instanceof File) {
			throw new \InvalidArgumentException('Die Seite „Kindergartentagebuch“ wurde nicht gefunden.');
		}
		return $file;
	}

	private function lastTitle(): string {
		try {
			return preg_match('/^#{2,6}\s+(.+)$/m', $this->page()->getContent(), $m) ? trim($m[1]) : '';
		} catch (\Throwable $e) {
			return '';
		}
	}

	private function loadDraft(): ?array {
		$d = json_decode($this->config->getValueString($this->appName, 'diary_draft', ''), true);
		return is_array($d) ? $d : null;
	}

	public function state(IUser $user): array {
		if (!$this->canWrite($user)) {
			return ['canWrite' => false];
		}
		return [
			'canWrite' => true,
			'draft' => $this->loadDraft(),
			'suggestion' => [
				'title' => $this->suggestedTitle(),
				'text' => "Liebe Waldeltern,\n\n\n\nGruß die Waldfeen",
			],
			'last' => $this->lastTitle(),
			'mailTo' => $this->mailTo(),
		];
	}

	private function clean(array $in): array {
		$title = trim(strip_tags((string)($in['title'] ?? '')));
		$text = trim(str_replace("\r\n", "\n", strip_tags((string)($in['text'] ?? ''))));
		$link = trim((string)($in['link'] ?? ''));
		if (mb_strlen($title) > 120) {
			throw new \InvalidArgumentException('Der Titel ist zu lang (höchstens 120 Zeichen).');
		}
		if (mb_strlen($text) > 8000) {
			throw new \InvalidArgumentException('Der Text ist zu lang (höchstens 8000 Zeichen).');
		}
		if ($link !== '' && !preg_match('~^https://[^\s()<>]+$~i', $link)) {
			throw new \InvalidArgumentException('Der Fotolink muss mit https:// beginnen.');
		}
		$cover = trim((string)($in['cover'] ?? ''));
		if ($cover !== '' && !preg_match('/^[0-9a-f-]{36}$/', $cover)) {
			$cover = '';
		}
		return ['title' => $title, 'text' => $text, 'link' => $link, 'cover' => $cover];
	}

	public function saveDraft(IUser $user, array $in): void {
		$this->requireWriter($user);
		$d = $this->clean($in);
		$d['by'] = $user->getDisplayName();
		$d['updated'] = time();
		$this->config->setValueString($this->appName, 'diary_draft', json_encode($d, JSON_UNESCAPED_UNICODE));
	}

	/** @return int Anzahl der Mails (0 oder 1: eine Mail an die Elternliste) */
	public function publish(IUser $user, array $in, bool $notify): int {
		$this->requireWriter($user);
		$d = $this->clean($in);
		if ($d['title'] === '') {
			throw new \InvalidArgumentException('Bitte einen Titel eingeben.');
		}
		$body = preg_replace('/\n{3,}/', "\n\n", $d['text']);
		if (mb_strlen(trim(preg_replace('/^(Liebe[^\n]*|Gruß[^\n]*)$/mu', '', $body))) < 40) {
			throw new \InvalidArgumentException('Der Text ist noch sehr kurz. Bitte schreibe, was in der Woche los war.');
		}

		// Titelbild vorab holen: schlägt das fehl, wird trotzdem ohne Bild veröffentlicht
		$jpeg = null;
		if ($d['cover'] !== '' && $d['link'] !== '') {
			try {
				$jpeg = $this->coverJpeg($d['link'], $d['cover']);
			} catch (\Throwable $e) {
				$this->logger->warning('Titelbild nicht geladen: ' . $e->getMessage(), ['app' => $this->appName]);
			}
		}

		$fh = fopen(sys_get_temp_dir() . '/kitaapp-diary.lock', 'c');
		flock($fh, LOCK_EX);
		try {
			$file = $this->page();
			$old = $file->getContent();
			$this->backup($old);
			$coverRef = '';
			if ($d['cover'] !== '' && $jpeg !== null) {
				$coverRef = $this->storeCover($file, $jpeg, $d['title']);
			}
			$file->putContent($this->insertEntry($old, $d['title'], $body, $d['link'], $coverRef));
			$this->dropEditorSessions($file->getId());
		} finally {
			flock($fh, LOCK_UN);
			fclose($fh);
		}
		$this->config->deleteKey($this->appName, 'diary_draft');

		return $notify ? $this->mail($d['title'], $body, $d['link'], $user->getDisplayName(), $jpeg) : 0;
	}

	/** Neuester Eintrag oben, direkt unter dem Einleitungstext (nach der ersten Trennlinie). */
	private function insertEntry(string $md, string $title, string $body, string $link, string $coverRef = ''): string {
		$sep = preg_match('/^\\\\_+\\\\_$/m', $md, $m) ? $m[0] : self::SEPARATOR;
		$entry = '##### ' . $title . "\n\n"
			. ($coverRef !== '' ? '![Titelbild](' . $coverRef . ")\n\n" : '')
			. $body . "\n\n"
			. ($link !== '' ? '[Alle Fotos der Woche sehen.](' . $link . ")\n\n" : '')
			. $sep . "\n\n";
		$pos = strpos($md, "\n---\n");
		if ($pos === false) {
			return rtrim($md) . "\n\n" . $entry;
		}
		$head = substr($md, 0, $pos + 5);
		return $head . "\n" . $entry . ltrim(substr($md, $pos + 5), "\n");
	}

	private function backup(string $content): void {
		try {
			try {
				$folder = $this->appData->getFolder('diary');
			} catch (NotFoundException $e) {
				$folder = $this->appData->newFolder('diary');
			}
			$name = 'tagebuch-' . date('Ymd-His') . '.md';
			$folder->newFile($name, $content);
			// die letzten 20 Sicherungen behalten
			$names = array_map(fn ($f) => $f->getName(), $folder->getDirectoryListing());
			rsort($names);
			foreach (array_slice($names, 20) as $n) {
				$folder->getFile($n)->delete();
			}
		} catch (\Throwable $e) {
			$this->logger->warning('Tagebuch-Sicherung fehlgeschlagen: ' . $e->getMessage(), ['app' => $this->appName]);
		}
	}

	/** Offene Sitzungen des Texteditors verwerfen, damit ein Editor die neue Fassung nicht überschreibt. */
	private function dropEditorSessions(int $fileId): void {
		foreach ([['text_steps', 'document_id'], ['text_sessions', 'document_id'], ['text_documents', 'id']] as [$table, $col]) {
			try {
				$qb = $this->db->getQueryBuilder();
				$qb->delete($table)->where($qb->expr()->eq($col, $qb->createNamedParameter($fileId)))->executeStatement();
			} catch (\Throwable $e) {
				$this->logger->info('Editor-Sitzung nicht bereinigt (' . $table . '): ' . $e->getMessage(), ['app' => $this->appName]);
			}
		}
	}

	private function teaser(string $body): string {
		$paras = array_values(array_filter(array_map('trim', preg_split('/\n\s*\n/', $body))));
		$pick = '';
		foreach ($paras as $p) {
			$plain = trim(preg_replace('/[*_#`>]|\[|\]\([^)]*\)/u', '', $p));
			if (mb_strlen($plain) > 60 && !preg_match('/^(Liebe|Gruß)/u', $plain)) {
				$pick = $plain;
				break;
			}
		}
		$pick = $pick !== '' ? $pick : trim(preg_replace('/[*_#`>]/u', '', $paras[0] ?? ''));
		$pick = preg_replace('/\s+/u', ' ', $pick);
		if (mb_strlen($pick) > 220) {
			$pick = preg_replace('/\s+\S*$/u', '', mb_substr($pick, 0, 220)) . ' …';
		}
		return $pick;
	}

	private function shareKey(string $link): string {
		return preg_match('~^' . preg_quote($this->org->photoHost(), '~') . '/share/([A-Za-z0-9_-]{10,})~', $link, $m) ? $m[1] : '';
	}

	private function photoGet(string $path, array $query, bool $json = true) {
		$res = $this->http->newClient()->get($this->org->photoHost() . '/api/' . $path, ['query' => $query, 'timeout' => 20]);
		$body = $res->getBody();
		return $json ? json_decode((string)$body, true) : (string)$body;
	}

	/** Fotos des Albums hinter dem Freigabe-Link: Titelbild-Vorschlag (Album-Cover) und bis zu 80 Bilder zur Auswahl. */
	public function photos(IUser $user, string $link): array {
		$this->requireWriter($user);
		$key = $this->shareKey($link);
		if ($key === '') {
			throw new \InvalidArgumentException('Das ist kein Immich-Freigabelink (' . $this->org->photoHost() . '/share/…).');
		}
		try {
			$me = $this->photoGet('shared-links/me', ['key' => $key]);
			$album = $me['album']['id'] ?? '';
			if ($album === '') {
				throw new \RuntimeException('kein Album');
			}
			$ids = [];
			$res = $this->http->newClient()->post($this->org->photoHost() . '/api/search/metadata', [
				'query' => ['key' => $key],
				'json' => ['albumIds' => [$album], 'type' => 'IMAGE', 'size' => 80],
				'timeout' => 20,
			]);
			foreach ((json_decode((string)$res->getBody(), true)['assets']['items'] ?? []) as $a) {
				$ids[] = $a['id'];
			}
		} catch (\Throwable $e) {
			$this->logger->warning('Fotoalbum nicht lesbar: ' . $e->getMessage(), ['app' => $this->appName]);
			throw new \InvalidArgumentException('Das Album konnte nicht geladen werden. Stimmt der Freigabelink?');
		}
		return ['cover' => $me['album']['albumThumbnailAssetId'] ?? ($ids[0] ?? ''), 'photos' => $ids];
	}

	/** Bytes eines Albumfotos (size: thumbnail oder preview). */
	public function photo(IUser $user, string $link, string $id, string $size = 'thumbnail'): string {
		$this->requireWriter($user);
		$key = $this->shareKey($link);
		if ($key === '' || !preg_match('/^[0-9a-f-]{36}$/', $id)) {
			throw new \InvalidArgumentException('Ungültige Anfrage.');
		}
		return $this->photoGet('assets/' . $id . '/thumbnail', ['size' => $size === 'preview' ? 'preview' : 'thumbnail', 'key' => $key], false);
	}

	/** Titelbild als JPEG, höchstens 1200 px breit (läuft in Mail und Tagebuch überall). */
	private function coverJpeg(string $link, string $id): ?string {
		$key = $this->shareKey($link);
		if ($key === '') {
			return null;
		}
		$raw = $this->photoGet('assets/' . $id . '/thumbnail', ['size' => 'preview', 'key' => $key], false);
		$img = @imagecreatefromstring($raw);
		if ($img === false) {
			throw new \RuntimeException('Bild nicht lesbar');
		}
		$w = imagesx($img);
		if ($w > 1200) {
			$img = imagescale($img, 1200);
		}
		ob_start();
		imagejpeg($img, null, 82);
		return ob_get_clean() ?: null;
	}

	/** Legt das Bild im Anhangsordner der Seite ab und gibt den Markdown-Pfad zurück. */
	private function storeCover(File $page, string $jpeg, string $title): string {
		$dir = '.attachments.' . $page->getId();
		$parent = $page->getParent();
		try {
			$folder = $parent->get($dir);
		} catch (NotFoundException $e) {
			$folder = $parent->newFolder($dir);
		}
		$name = 'Titelbild-' . date('Ymd-His') . '.jpg';
		$folder->newFile($name, $jpeg);
		return $dir . '/' . $name;
	}

	private const GREETINGS = [
		'Liebe Eltern, was für eine aufregende Woche!',
		'Liebe Waldeltern, es gibt Neues aus dem Wald!',
		'Liebe Eltern, kaum zu glauben, wie schnell die Woche vorbei war.',
		'Liebe Waldeltern, wir haben euch wieder einiges zu erzählen.',
		'Liebe Eltern, ein bunter Wochenrückblick wartet auf euch.',
		'Liebe Waldeltern, schaut mal, was bei uns los war!',
	];

	private const CLOSINGS = [
		'Wir freuen uns auf die nächste Woche im Wald!',
		'Wir sind schon gespannt auf die kommende Woche.',
		'Wir freuen uns auf viele neue Entdeckungen mit den Kindern.',
		'Danke für euer Vertrauen, wir freuen uns auf die nächste Woche.',
	];

	/** Begrüßung und Abschluss wechseln mit der Kalenderwoche, damit die Mails nicht jede Woche gleich klingen. */
	private function rotate(array $list, int $offset = 0): string {
		$week = (int)(new \DateTimeImmutable('now', new \DateTimeZone('Europe/Berlin')))->format('W');
		return $list[($week + $offset) % count($list)];
	}

	/** Vorname der Schreibenden für die Unterschrift („Anna Muster“ → „Anna“). */
	private function firstName(string $display): string {
		$first = trim(explode(' ', trim($display))[0] ?? '');
		return $first !== '' ? $first : 'Das Team';
	}

	/** @return array{0: string, 1: string, 2: string} Betreff, HTML, Text */
	public function buildMail(string $title, string $body, string $link, string $author, bool $hasCover = false): array {
		$greeting = $this->rotate(self::GREETINGS);
		$closing = $this->rotate(self::CLOSINGS, 2);
		$teaser = $this->teaser($body);
		$name = $this->firstName($author);
		$sign = $name === 'Das Team' ? 'Eure Waldfeen' : 'Herzliche Grüße von ' . $name . ' und den Waldfeen';
		$url = $this->pageUrl();
		$e = fn (string $t): string => htmlspecialchars($t, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');

		$subject = 'Neues aus dem Wald: ' . $title;

		$inner = $this->mailBody($body);
		$text = $greeting . "\n\n"
			. $title . "\n\n"
			. $this->mdToText($inner) . "\n\n"
			. "Im Handbuch ansehen (mit Anmeldung):\n" . $url . "\n"
			. ($link !== '' ? "\nAlle Fotos der Woche:\n" . $link . "\n" : '')
			. "\n" . $closing . "\n\n" . $sign . "\n\n"
			. "--\n" . $this->org->name() . "\n" . $this->questionsText() . "\n";

		$photos = $link !== ''
			? '<a href="' . $e($link) . '" style="color:#5E6B3C;font-size:15px;text-decoration:underline;">Alle Fotos der Woche ansehen</a>'
			: '';

		$html = '<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
			. '<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only">'
			. '<title>' . $e($subject) . '</title></head>'
			. '<body style="margin:0;padding:0;background:#F6F2E8;">'
			. '<div style="display:none;max-height:0;overflow:hidden;opacity:0;">' . $e($teaser) . '</div>'
			. '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F6F2E8;"><tr><td align="center" style="padding:24px 12px;">'
			. '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#FFFFFF;border-radius:4px;">'
			// Kopf mit Logo
			. ($this->logoBytes() !== null ? '<tr><td style="padding:32px 36px 8px 36px;"><img src="cid:logo.png" width="190" alt="' . $e($this->org->name()) . '" style="display:block;border:0;height:auto;width:190px;max-width:100%;"></td></tr>' : '')
			// Titelblock
			. '<tr><td align="center" style="padding:36px 36px 0 36px;font-family:Helvetica,Arial,sans-serif;">'
			. '<div style="font-size:12px;letter-spacing:4px;color:#8A8F6A;text-transform:uppercase;">Kindergartentagebuch</div>'
			. '<div style="font-size:26px;line-height:1.25;letter-spacing:1.5px;color:#5E6B3C;text-transform:uppercase;padding-top:12px;">' . $e($title) . '</div>'
			. '<div style="width:90px;height:1px;background:#B9AE8E;margin:22px auto 0 auto;line-height:1px;font-size:1px;">&nbsp;</div>'
			. '</td></tr>'
			// Titelbild
			. ($hasCover ? '<tr><td style="padding:28px 0 0 0;"><img src="cid:cover.jpg" width="600" alt="' . $e($title) . '" style="display:block;border:0;width:100%;max-width:600px;height:auto;"></td></tr>' : '')
			// Anrede
			. '<tr><td style="padding:28px 40px 0 40px;font-family:Helvetica,Arial,sans-serif;font-size:18px;line-height:1.5;color:#24385B;">' . $e($greeting) . '</td></tr>'
			// Text des Rückblicks
			. '<tr><td style="padding:20px 40px 0 40px;font-family:Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6;color:#24385B;">' . $this->mdToHtml($inner, $e) . '</td></tr>'
			// Knopf
			. '<tr><td align="center" style="padding:30px 40px 6px 40px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr>'
			. '<td align="center" style="background:#C9743A;border-radius:24px;"><a href="' . $e($url) . '" style="display:inline-block;padding:14px 34px;font-family:Helvetica,Arial,sans-serif;font-size:16px;letter-spacing:0.5px;color:#FFFFFF;text-decoration:none;">Im Handbuch ansehen</a></td>'
			. '</tr></table></td></tr>'
			. ($photos !== '' ? '<tr><td align="center" style="padding:14px 40px 0 40px;font-family:Helvetica,Arial,sans-serif;">' . $photos . '</td></tr>' : '')
			// Abschluss
			. '<tr><td style="padding:34px 40px 0 40px;font-family:Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6;color:#24385B;">'
			. $e($closing) . '<br><br><span style="color:#5E6B3C;">' . $e($sign) . '</span></td></tr>'
			// Fuß
			. '<tr><td style="padding:34px 40px 30px 40px;"><div style="border-top:1px solid #E4DECB;padding-top:16px;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:#8A8F6A;">'
			. $e($this->org->name()) . '<br>Du bekommst diese Mail, weil du im Eltern-Verteiler stehst. ' . $this->questionsHtml($e)
			. '</div></td></tr>'
			. '</table></td></tr></table></body></html>';

		return [$subject, $html, $text];
	}

	/** Text für die Mail: Anrede und Gruß der Vorlage fallen weg (die Mail bringt eigene), Bilder auch. */
	private function mailBody(string $body): string {
		$body = preg_replace('/!\[[^\]]*\]\([^)]*\)/u', '', $body);
		$lines = preg_split('/\R/u', trim($body));
		while ($lines && preg_match('/^(\s*|Liebe[^\n]*)$/u', $lines[0])) {
			array_shift($lines);
		}
		while ($lines && preg_match('/^(\s*|Gruß[^\n]*|Herzliche Grüße[^\n]*)$/u', end($lines))) {
			array_pop($lines);
		}
		return trim(implode("\n", $lines));
	}

	/** Markdown als Klartext: Links bleiben als Adresse erhalten. */
	private function mdToText(string $md): string {
		// Auszeichnung nur außerhalb von Links entfernen (Adressen enthalten oft _ und *)
		$parts = preg_split('/(\[[^\]]+\]\(https?:[^)\s]+\))/u', $md, -1, PREG_SPLIT_DELIM_CAPTURE);
		$out = '';
		foreach ($parts as $part) {
			$out .= preg_match('/^\[([^\]]+)\]\((https?:[^)\s]+)\)$/u', $part, $m)
				? $m[1] . ' (' . $m[2] . ')'
				: preg_replace('/\*\*|(?<![\w*])\*(?=\S)|(?<=\S)\*(?![\w*])/u', '', $part);
		}
		return $out;
	}

	/** Einfaches Markdown (Absätze, **fett**, *kursiv*, Links, Aufzählungen) als Mail-HTML. */
	private function mdToHtml(string $md, callable $e): string {
		$out = [];
		foreach (preg_split('/\n\s*\n/u', $md) as $para) {
			$para = trim($para);
			if ($para === '') {
				continue;
			}
			$html = [];
			foreach (preg_split('/\R/u', $para) as $line) {
				$line = trim($line);
				$bullet = preg_match('/^[-*]\s+(.*)$/u', $line, $m);
				$line = $bullet ? $m[1] : preg_replace('/^#+\s*/u', '', $line);
				$h = $e($line);
				$h = preg_replace_callback('/\[([^\]]+)\]\((https?:[^)\s]+)\)/u', fn ($mm) => '<a href="' . $mm[2] . '" style="color:#5E6B3C;text-decoration:underline;">' . $mm[1] . '</a>', $h);
				$h = preg_replace('/\*\*(.+?)\*\*/u', '<strong>$1</strong>', $h);
				$h = preg_replace('/(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])/u', '<em>$1</em>', $h);
				$html[] = ($bullet ? '&bull; ' : '') . $h;
			}
			$out[] = '<p style="margin:0 0 16px 0;">' . implode('<br>', $html) . '</p>';
		}
		return implode('', $out);
	}

	/** Hinweis am Mail-Ende: Antworten gehen nicht, Fragen laufen über den Eltern-Chat. */
	private function questionsText(): string {
		$url = $this->org->parentChatUrl();
		return $url !== '' ? 'Fragen? Bitte im Eltern-Chat stellen: ' . $url : 'Diese Mail kann nicht beantwortet werden.';
	}

	private function questionsHtml(callable $e): string {
		$url = $this->org->parentChatUrl();
		return $url !== ''
			? 'Fragen? <a href="' . $e($url) . '" style="color:#5E6B3C;text-decoration:underline;">Bitte im Eltern-Chat stellen</a>.'
			: 'Diese Mail kann nicht beantwortet werden.';
	}

	/** Logo für die Mail: img/mail-logo.png der App (gehört nicht ins Repository, jede Einrichtung legt ihr eigenes ab). */
	private function logoBytes(): ?string {
		$bytes = @file_get_contents(__DIR__ . '/../../img/mail-logo.png');
		return $bytes === false ? null : $bytes;
	}

	private function mail(string $title, string $body, string $link = '', string $author = '', ?string $cover = null): int {
		if ($this->mailTo() === '') {
			return 0;
		}
		[$subject, $html, $text] = $this->buildMail($title, $body, $link, $author, $cover !== null);
		try {
			$msg = $this->mailer->createMessage();
			$this->org->applySender($msg, false);
			$msg->setTo([$this->mailTo() => 'Eltern']);
			$msg->setSubject($subject);
			$msg->setPlainBody($text);
			$msg->setHtmlBody($html);
			$logo = $this->logoBytes();
			if ($logo !== null) {
				$msg->attachInline($logo, 'logo.png', 'image/png');
			}
			if ($cover !== null) {
				$msg->attachInline($cover, 'cover.jpg', 'image/jpeg');
			}
			$this->mailer->send($msg);
			return 1;
		} catch (\Throwable $e) {
			$this->logger->warning('Tagebuch-Mail nicht gesendet: ' . $e->getMessage(), ['app' => $this->appName]);
			throw new \InvalidArgumentException('Der Eintrag ist veröffentlicht, aber die E-Mail an die Eltern konnte nicht verschickt werden.');
		}
	}
}
