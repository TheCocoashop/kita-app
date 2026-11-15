<?php

declare(strict_types=1);

namespace OCA\KitaApp\Service;

use OCP\Files\IAppData;
use OCP\Files\NotFoundException;
use OCP\IAppConfig;
use OCP\IGroupManager;
use OCP\IURLGenerator;
use OCP\IUser;
use OCP\Mail\IMailer;
use Psr\Log\LoggerInterface;

/**
 * Meldungen für die Startseite. Schreiben dürfen nur Mitglieder der Gruppe „Vorstand“ (Einstellung ank_group)
 * und Administratoren; lesen dürfen alle angemeldeten Eltern. Gespeichert wird als JSON in den App-Einstellungen,
 * Bilder liegen im App-Datenordner.
 */
class AnnouncementService {
	private const MAX_IMAGE = 3 * 1024 * 1024;

	public function __construct(
		private string $appName,
		private IAppConfig $config,
		private IGroupManager $groups,
		private IAppData $appData,
		private IMailer $mailer,
		private IURLGenerator $urls,
		private LoggerInterface $logger,
		private OrgSettings $org,
	) {
	}

	/**
	 * Empfänger der Benachrichtigungsmail: alle Mitglieder der Gruppe notify_group (Standard „Eltern“) mit E-Mail-Adresse.
	 * @return array<string,string> Adresse => Name
	 */
	public function recipients(): array {
		$group = $this->groups->get($this->config->getValueString($this->appName, 'notify_group', 'Eltern'));
		$out = [];
		foreach ($group ? $group->getUsers() : [] as $u) {
			$mail = trim((string)$u->getEMailAddress());
			if ($u->isEnabled() && filter_var($mail, FILTER_VALIDATE_EMAIL)) {
				$out[strtolower($mail)] = $u->getDisplayName();
			}
		}
		return $out;
	}

	public function canPost(IUser $user): bool {
		$group = $this->config->getValueString($this->appName, 'ank_group', 'Vorstand');
		return $this->groups->isAdmin($user->getUID()) || $this->groups->isInGroup($user->getUID(), $group);
	}

	private function today(): string {
		return (new \DateTimeImmutable('today', new \DateTimeZone('Europe/Berlin')))->format('Y-m-d');
	}

	private function load(): array {
		$list = json_decode($this->config->getValueString($this->appName, 'announcements', '[]'), true);
		return is_array($list) ? $list : [];
	}

	private function save(array $list): void {
		$this->config->setValueString($this->appName, 'announcements', json_encode(array_values($list), JSON_UNESCAPED_UNICODE));
	}

	private function locked(callable $fn) {
		$fh = fopen(sys_get_temp_dir() . '/kitaapp-ank.lock', 'c');
		flock($fh, LOCK_EX);
		try {
			return $fn();
		} finally {
			flock($fh, LOCK_UN);
			fclose($fh);
		}
	}

	/** Eltern sehen die gerade gültigen Meldungen, der Vorstand zusätzlich alle anderen (zum Bearbeiten). */
	public function forUser(IUser $user): array {
		$canPost = $this->canPost($user);
		$today = $this->today();
		$list = $this->load();
		usort($list, fn ($a, $b) => $b['created'] <=> $a['created']);
		$view = function (array $a) use ($today) {
			$a['active'] = $a['from'] <= $today && $a['until'] >= $today;
			$a['upcoming'] = $a['from'] > $today;
			return $a;
		};
		$list = array_map($view, $list);
		return [
			'canPost' => $canPost,
			'mailCount' => $canPost ? count($this->recipients()) : 0,
			'items' => array_values($canPost ? $list : array_filter($list, fn ($a) => $a['active'])),
		];
	}

	/** Neu anlegen (id leer) oder ändern. */
	/** @return int Anzahl der angeschriebenen Adressen (0, wenn keine Mail gewünscht) */
	public function store(IUser $user, ?string $id, array $in): int {
		$this->requirePoster($user);
		$title = trim((string)($in['title'] ?? ''));
		$text = trim((string)($in['text'] ?? ''));
		$from = (string)($in['validFrom'] ?? '');
		$until = (string)($in['validUntil'] ?? '');
		if ($title === '' || mb_strlen($title) > 120) {
			throw new \InvalidArgumentException('Bitte einen Titel eingeben (höchstens 120 Zeichen).');
		}
		if (mb_strlen($text) > 3000) {
			throw new \InvalidArgumentException('Der Text ist zu lang (höchstens 3000 Zeichen).');
		}
		foreach ([$from, $until] as $d) {
			if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $d) || !checkdate((int)substr($d, 5, 2), (int)substr($d, 8, 2), (int)substr($d, 0, 4))) {
				throw new \InvalidArgumentException('Bitte Anzeige von/bis als Datum angeben.');
			}
		}
		if ($until < $from) {
			throw new \InvalidArgumentException('„Bis“ liegt vor „von“.');
		}
		$buttons = [];
		$label = trim((string)($in['buttonLabel'] ?? ''));
		$href = trim((string)($in['buttonHref'] ?? ''));
		if ($href !== '') {
			if (!preg_match('~^(#/[a-z0-9/_-]*|https://\S+)$~i', $href)) {
				throw new \InvalidArgumentException('Der Link muss mit https:// beginnen.');
			}
			$buttons[] = ['label' => mb_substr($label !== '' ? $label : 'Mehr', 0, 40), 'href' => $href];
		}

		$notify = !empty($in['notify']);
		$saved = null;
		$this->locked(function () use ($user, $id, $title, $text, $from, $until, $buttons, $in, $notify, &$saved) {
			$list = $this->load();
			$i = $id === null ? false : array_search($id, array_column($list, 'id'), true);
			if ($id !== null && $i === false) {
				throw new \InvalidArgumentException('Diese Meldung gibt es nicht mehr.');
			}
			$rec = $i === false
				? ['id' => bin2hex(random_bytes(5)), 'created' => time(), 'author' => $user->getDisplayName(), 'image' => null]
				: $list[$i];
			$image = $in['image'] ?? null;
			if (is_string($image) && $image !== '') {
				$rec['image'] = $this->storeImage($rec['id'], $image);
			} elseif (!empty($in['removeImage']) && $rec['image']) {
				$this->deleteImage($rec['id']);
				$rec['image'] = null;
			}
			$rec = ['title' => $title, 'text' => $text, 'from' => $from, 'until' => $until, 'buttons' => $buttons, 'updated' => time()] + $rec;
			if ($i === false) {
				$list[] = $rec;
			} else {
				$list[$i] = $rec;
			}
			if ($notify) {
				$rec['notified'] = time();
				if ($i === false) {
					$list[count($list) - 1] = $rec;
				} else {
					$list[$i] = $rec;
				}
			}
			$this->save($list);
			$saved = $rec;
		});
		return $notify && $saved ? $this->notifyParents($saved) : 0;
	}

	/** Eine Mail mit allen Empfängern in BCC (niemand sieht die Adressen der anderen); Fehler brechen das Speichern nicht ab. */
	private function notifyParents(array $rec): int {
		$to = $this->recipients();
		if (!$to) {
			return 0;
		}
		$url = $this->urls->getAbsoluteURL($this->urls->linkToRoute('kitaapp.page.index')) . '#/aktuell/' . $rec['id'];
		$body = $rec['title'] . "\n\n" . ($rec['text'] !== '' ? $rec['text'] . "\n\n" : '')
			. "In der KiTa-App ansehen:\n" . $url . "\n\n"
			. "Viele Grüße\n" . $this->org->name() . "\n\n"
			. "Du bekommst diese Nachricht, weil du in der KitaCloud als Elternteil angemeldet bist.\n";
		$sent = 0;
		foreach (array_chunk(array_keys($to), 25) as $chunk) {
			try {
				$msg = $this->mailer->createMessage();
				$this->org->applySender($msg);
				$self = $this->org->mailContact() ?: $this->org->mailFrom();
				if ($self !== '') {
					$msg->setTo([$self => $this->org->shortName()]);
				}
				$msg->setBcc(array_combine($chunk, array_map(fn ($a) => $to[$a], $chunk)));
				$msg->setSubject('Neue Meldung: ' . $rec['title']);
				$msg->setPlainBody($body);
				$this->mailer->send($msg);
				$sent += count($chunk);
			} catch (\Throwable $e) {
				$this->logger->warning('Meldungs-Mail nicht gesendet: ' . $e->getMessage(), ['app' => $this->appName]);
			}
		}
		if ($sent === 0) {
			throw new \InvalidArgumentException('Die Meldung ist gespeichert, aber die E-Mail konnte nicht verschickt werden.');
		}
		return $sent;
	}

	public function delete(IUser $user, string $id): void {
		$this->requirePoster($user);
		$this->locked(function () use ($id) {
			$list = array_values(array_filter($this->load(), fn ($a) => $a['id'] !== $id));
			$this->deleteImage($id);
			$this->save($list);
		});
	}

	/** @return array{0:string,1:string}|null Bildinhalt und Typ */
	public function image(string $id): ?array {
		$rec = current(array_filter($this->load(), fn ($a) => $a['id'] === $id));
		if (!$rec || empty($rec['image'])) {
			return null;
		}
		try {
			return [$this->folder()->getFile($id)->getContent(), $rec['image']];
		} catch (NotFoundException $e) {
			return null;
		}
	}

	private function requirePoster(IUser $user): void {
		if (!$this->canPost($user)) {
			throw new \InvalidArgumentException('Meldungen dürfen nur vom Vorstand geschrieben werden.');
		}
	}

	private function folder() {
		try {
			return $this->appData->getFolder('ank');
		} catch (NotFoundException $e) {
			return $this->appData->newFolder('ank');
		}
	}

	/** @return string Bildtyp */
	private function storeImage(string $id, string $dataUrl): string {
		if (!preg_match('~^data:(image/(?:jpeg|png|webp));base64,(.+)$~s', $dataUrl, $m)) {
			throw new \InvalidArgumentException('Das Bild muss ein JPEG, PNG oder WebP sein.');
		}
		$bytes = base64_decode($m[2], true);
		if ($bytes === false || strlen($bytes) > self::MAX_IMAGE || @getimagesizefromstring($bytes) === false) {
			throw new \InvalidArgumentException('Das Bild ist beschädigt oder zu groß (höchstens 3 MB).');
		}
		$folder = $this->folder();
		try {
			$folder->getFile($id)->putContent($bytes);
		} catch (NotFoundException $e) {
			$folder->newFile($id, $bytes);
		}
		return $m[1];
	}

	private function deleteImage(string $id): void {
		try {
			$this->folder()->getFile($id)->delete();
		} catch (\Throwable $e) {
			// kein Bild vorhanden
		}
	}
}
