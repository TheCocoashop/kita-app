<?php

declare(strict_types=1);

namespace OCA\KitaApp\Service;

use OCP\IAppConfig;
use OCP\IDBConnection;
use OCP\IGroupManager;
use OCP\IUser;
use OCP\IUserManager;
use OCP\Mail\IMailer;
use Psr\Log\LoggerInterface;

/**
 * Abwesenheitsmeldungen: Eltern melden ihr Kind (krank, Urlaub, sonstiges), das Team sieht die Tagesliste.
 * Gespeichert werden nur Vorname, Zeitraum und Art. Kein Freitext, keine Diagnose.
 *
 * Einstellungen (occ config:app:set kitaapp …):
 *   absence_mode          off | team | on   (team = nur Team, Vorstand und Admins sehen das Modul; Standard)
 *   absence_groups        Gruppen mit Einsicht in die Liste (Standard „Vorstand,Team-Kita“)
 *   absence_team_mail     Adresse für die Mail bei neuer Meldung für heute (leer = keine Mail)
 *   absence_retention     Aufbewahrung in Monaten (Standard 24)
 */
class AbsenceService {
	public const KINDS = ['krank' => 'krank', 'urlaub' => 'Urlaub', 'sonstiges' => 'sonstiges'];
	private const MAX_DAYS = 120;

	public function __construct(
		private string $appName,
		private IAppConfig $config,
		private IDBConnection $db,
		private IGroupManager $groups,
		private IUserManager $users,
		private FamilyDirectory $directory,
		private IMailer $mailer,
		private LoggerInterface $logger,
		private OrgSettings $org,
	) {
	}

	// ---------- Rechte und Schalter ----------

	public function mode(): string {
		$m = $this->config->getValueString($this->appName, 'absence_mode', 'team');
		return in_array($m, ['off', 'team', 'on'], true) ? $m : 'team';
	}

	public function isTeam(IUser $user): bool {
		if ($this->groups->isAdmin($user->getUID())) {
			return true;
		}
		$names = $this->config->getValueString($this->appName, 'absence_groups', 'Vorstand,Team-Kita');
		foreach (array_filter(array_map('trim', explode(',', $names))) as $g) {
			if ($this->groups->isInGroup($user->getUID(), $g)) {
				return true;
			}
		}
		return false;
	}

	/** Sichtbar für alle bei „on“, bei „team“ nur für das Team. */
	public function visibleTo(IUser $user): bool {
		return match ($this->mode()) {
			'on' => true,
			'team' => $this->isTeam($user),
			default => false,
		};
	}

	private function today(): string {
		return (new \DateTimeImmutable('today', new \DateTimeZone('Europe/Berlin')))->format('Y-m-d');
	}

	// ---------- Schnittstelle für die App ----------

	public function state(IUser $user): array {
		if (!$this->visibleTo($user)) {
			return ['enabled' => false];
		}
		$fam = $this->directory->familyOf($user);
		$team = $this->isTeam($user);
		$today = $this->today();
		$out = [
			'enabled' => true,
			'team' => $team,
			'kinds' => self::KINDS,
			'today' => $today,
			'children' => $fam ? array_map(fn ($c) => $c['name'], $fam['children']) : [],
			'mine' => $fam ? $this->mine($fam['uid'], $today) : [],
		];
		if ($team) {
			$out['list'] = $this->upcoming($today, 14);
		}
		return $out;
	}

	public function report(IUser $user, string $child, string $from, string $to, string $kind): void {
		if (!$this->visibleTo($user)) {
			throw new \RuntimeException('Die Abwesenheitsmeldung ist noch nicht freigeschaltet.');
		}
		$fam = $this->directory->familyOf($user)
			?? throw new \InvalidArgumentException('Wir finden eure Familie nicht. ' . $this->org->helpHint() . ', damit die Mailadresse in der Elternliste ergänzt wird.');
		$names = array_map(fn ($c) => $c['name'], $fam['children']);
		if (!in_array($child, $names, true)) {
			throw new \InvalidArgumentException('Dieses Kind gehört nicht zu eurer Familie.');
		}
		if (!isset(self::KINDS[$kind])) {
			throw new \InvalidArgumentException('Bitte wählt krank, Urlaub oder sonstiges.');
		}
		$d1 = \DateTimeImmutable::createFromFormat('!Y-m-d', $from);
		$d2 = \DateTimeImmutable::createFromFormat('!Y-m-d', $to);
		if (!$d1 || !$d2 || $d1->format('Y-m-d') !== $from || $d2->format('Y-m-d') !== $to) {
			throw new \InvalidArgumentException('Bitte gebt Datum von und bis an.');
		}
		$today = $this->today();
		if ($to < $from) {
			throw new \InvalidArgumentException('„Bis“ liegt vor „von“.');
		}
		if ($from < (new \DateTimeImmutable($today))->modify('-3 days')->format('Y-m-d')) {
			throw new \InvalidArgumentException('Rückwirkend geht es nur für die letzten drei Tage. Bitte sagt dem Team Bescheid.');
		}
		if ($d1->diff($d2)->days > self::MAX_DAYS) {
			throw new \InvalidArgumentException('Der Zeitraum ist zu lang. Bitte meldet höchstens ' . self::MAX_DAYS . ' Tage am Stück.');
		}
		$qb = $this->db->getQueryBuilder();
		$qb->select('id')->from('kitaapp_absence')->where(
			$qb->expr()->eq('card_uid', $qb->createNamedParameter($fam['uid'])),
			$qb->expr()->eq('child', $qb->createNamedParameter($child)),
			$qb->expr()->eq('from_date', $qb->createNamedParameter($from)),
			$qb->expr()->eq('to_date', $qb->createNamedParameter($to)),
			$qb->expr()->eq('kind', $qb->createNamedParameter($kind)),
			$qb->expr()->eq('cancelled', $qb->createNamedParameter(0, \OCP\DB\QueryBuilder\IQueryBuilder::PARAM_INT)),
		);
		if ($qb->executeQuery()->fetchOne() !== false) {
			return; // doppelt getippt
		}
		$qb = $this->db->getQueryBuilder();
		$qb->insert('kitaapp_absence')->values([
			'card_uid' => $qb->createNamedParameter($fam['uid']),
			'child' => $qb->createNamedParameter($child),
			'from_date' => $qb->createNamedParameter($from),
			'to_date' => $qb->createNamedParameter($to),
			'kind' => $qb->createNamedParameter($kind),
			'reported_by' => $qb->createNamedParameter($user->getUID()),
			'reported_at' => $qb->createNamedParameter(time(), \OCP\DB\QueryBuilder\IQueryBuilder::PARAM_INT),
			'cancelled' => $qb->createNamedParameter(0, \OCP\DB\QueryBuilder\IQueryBuilder::PARAM_INT),
		])->executeStatement();
		$this->purge();
		if ($from <= $today && $to >= $today) {
			$this->mailTeam($child, $from, $to);
		}
	}

	public function cancel(IUser $user, int $id): void {
		$fam = $this->directory->familyOf($user);
		$qb = $this->db->getQueryBuilder();
		$qb->select('card_uid')->from('kitaapp_absence')->where($qb->expr()->eq('id', $qb->createNamedParameter($id, \OCP\DB\QueryBuilder\IQueryBuilder::PARAM_INT)));
		$uid = $qb->executeQuery()->fetchOne();
		if ($uid === false || !$fam || $fam['uid'] !== $uid) {
			throw new \InvalidArgumentException('Diese Meldung gibt es nicht.');
		}
		$qb = $this->db->getQueryBuilder();
		$qb->update('kitaapp_absence')->set('cancelled', $qb->createNamedParameter(1, \OCP\DB\QueryBuilder\IQueryBuilder::PARAM_INT))
			->where($qb->expr()->eq('id', $qb->createNamedParameter($id, \OCP\DB\QueryBuilder\IQueryBuilder::PARAM_INT)))->executeStatement();
	}

	/** Prüfseite: nur Team. */
	public function check(IUser $user): array {
		if (!$this->isTeam($user)) {
			throw new \RuntimeException('Nur für das Team.');
		}
		$families = $this->directory->all();
		$known = [];
		foreach ($families as $f) {
			foreach ($f['emails'] as $e) {
				$known[$e] = true;
			}
		}
		$noCard = [];
		foreach ($this->users->search('') as $u) {
			if (!$u->isEnabled()) {
				continue;
			}
			$mail = strtolower(trim((string)$u->getEMailAddress()));
			if ($mail === '' || !isset($known[$mail])) {
				$noCard[] = ['name' => $u->getDisplayName(), 'mail' => $mail === '' ? '' : $mail];
			}
		}
		usort($noCard, fn ($a, $b) => strcasecmp($a['name'], $b['name']));
		$cards = [];
		$kids = 0;
		foreach ($families as $f) {
			$kids += count($f['children']);
			$cards[] = [
				'name' => $f['name'] ?: implode(' & ', $f['parents']),
				'children' => array_map(fn ($c) => $c['name'], $f['children']),
				'ignored' => $f['ignored'],
				'issues' => $f['issues'],
			];
		}
		usort($cards, fn ($a, $b) => strcasecmp($a['name'], $b['name']));
		return ['families' => count($families), 'children' => $kids, 'cards' => $cards, 'usersWithoutCard' => $noCard];
	}

	// ---------- Abfragen ----------

	private function mine(string $uid, string $today): array {
		$qb = $this->db->getQueryBuilder();
		$qb->select('id', 'child', 'from_date', 'to_date', 'kind')->from('kitaapp_absence')->where(
			$qb->expr()->eq('card_uid', $qb->createNamedParameter($uid)),
			$qb->expr()->eq('cancelled', $qb->createNamedParameter(0, \OCP\DB\QueryBuilder\IQueryBuilder::PARAM_INT)),
			$qb->expr()->gte('to_date', $qb->createNamedParameter($today)),
		)->orderBy('from_date')->addOrderBy('child');
		return array_map(fn ($r) => ['id' => (int)$r['id'], 'child' => $r['child'], 'from' => $r['from_date'], 'to' => $r['to_date'], 'kind' => $r['kind']], $qb->executeQuery()->fetchAll());
	}

	/** Alle Meldungen, die in den nächsten $days Tagen (ab heute) einen Tag berühren. */
	private function upcoming(string $today, int $days): array {
		$end = (new \DateTimeImmutable($today))->modify("+$days days")->format('Y-m-d');
		$qb = $this->db->getQueryBuilder();
		$qb->select('id', 'child', 'group_name', 'from_date', 'to_date', 'kind')->from('kitaapp_absence')->where(
			$qb->expr()->eq('cancelled', $qb->createNamedParameter(0, \OCP\DB\QueryBuilder\IQueryBuilder::PARAM_INT)),
			$qb->expr()->gte('to_date', $qb->createNamedParameter($today)),
			$qb->expr()->lte('from_date', $qb->createNamedParameter($end)),
		)->orderBy('from_date')->addOrderBy('child');
		return array_map(fn ($r) => [
			'child' => $r['child'], 'group' => $r['group_name'] ?? '', 'from' => $r['from_date'], 'to' => $r['to_date'], 'kind' => $r['kind'],
		], $qb->executeQuery()->fetchAll());
	}

	/** Alte Meldungen nach Ablauf der Aufbewahrungsfrist löschen. */
	public function purge(): void {
		$months = max(1, (int)$this->config->getValueString($this->appName, 'absence_retention', '24'));
		$cut = (new \DateTimeImmutable($this->today()))->modify("-$months months")->format('Y-m-d');
		$qb = $this->db->getQueryBuilder();
		$qb->delete('kitaapp_absence')->where($qb->expr()->lt('to_date', $qb->createNamedParameter($cut)))->executeStatement();
	}

	private function mailTeam(string $child, string $from, string $to): void {
		$addr = trim($this->config->getValueString($this->appName, 'absence_team_mail', ''));
		if ($addr === '') {
			return;
		}
		try {
			$de = fn (string $iso) => (new \DateTimeImmutable($iso))->format('d.m.Y');
			$msg = $this->mailer->createMessage();
			$msg->setTo([$addr => 'Team']);
			$msg->setSubject('Abwesenheit heute: ' . $child);
			$msg->setPlainBody("Neue Abmeldung in der KiTa-App:\n\n  {$child}, " . ($from === $to ? $de($from) : $de($from) . ' bis ' . $de($to)) . "\n\nDie ganze Liste: Handy-App, Seite „Abwesend“.\n\n" . $this->org->name() . "\n");
			$this->mailer->send($msg);
		} catch (\Throwable $e) {
			$this->logger->warning('Abwesenheits-Mail nicht gesendet: ' . $e->getMessage(), ['app' => $this->appName]);
		}
	}
}
