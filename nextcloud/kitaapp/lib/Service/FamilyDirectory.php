<?php

declare(strict_types=1);

namespace OCA\KitaApp\Service;

use OCP\IAppConfig;
use OCP\IDBConnection;
use OCP\IUser;
use Sabre\VObject\Reader;

/**
 * Familien und Kinder aus dem Adressbuch (eine Elternkarte = eine Familie). Die Karten bleiben die einzige Quelle.
 *
 * Schreibweise in der Notiz:
 *   Eltern: Vorname Nachname; Vorname Nachname
 *   Kinder: Vorname (geb. TT.MM.JJJJ); Vorname (geb. TT.MM.JJJJ)
 * Gelesen wird großzügig (auch „\;“, fehlender Zeilenumbruch, Zusätze wie „(gesch.)“).
 * Nur Einträge mit Geburtsdatum zählen als Kind im Kindergarten.
 */
class FamilyDirectory {
	public function __construct(
		private string $appName,
		private IAppConfig $config,
		private IDBConnection $db,
	) {
	}

	/**
	 * @return array<int,array{uid:string,name:string,emails:string[],parents:string[],children:array<int,array{name:string,born:string}>,ignored:string[],hasParentsLine:bool,hasChildrenLine:bool,issues:string[]}>
	 */
	public function all(): array {
		$out = [];
		foreach ($this->rawCards() as $data) {
			$f = self::parse($data);
			if ($f !== null) {
				$out[] = $f;
			}
		}
		return $out;
	}

	/** Familie des Nutzers anhand seiner Mailadresse; null, wenn keine Karte passt. */
	public function familyOf(IUser $user): ?array {
		$mail = strtolower(trim((string)$user->getEMailAddress()));
		if ($mail === '') {
			return null;
		}
		foreach ($this->all() as $f) {
			if (in_array($mail, $f['emails'], true) && $f['children']) {
				return $f;
			}
		}
		return null;
	}

	/** @return string[] vCard-Texte */
	private function rawCards(): array {
		$part = strtolower($this->config->getValueString($this->appName, 'addressbook', 'eltern'));
		$qb = $this->db->getQueryBuilder();
		$like = '%' . $this->db->escapeLikeParameter($part) . '%';
		$qb->select('id')->from('addressbooks')
			->where($qb->expr()->orX(
				$qb->expr()->like($qb->func()->lower('displayname'), $qb->createNamedParameter($like)),
				$qb->expr()->like($qb->func()->lower('uri'), $qb->createNamedParameter($like)),
			));
		$ids = array_map('intval', $qb->executeQuery()->fetchAll(\PDO::FETCH_COLUMN));
		if (!$ids) {
			return [];
		}
		$qb = $this->db->getQueryBuilder();
		$qb->select('carddata')->from('cards')->where($qb->expr()->in('addressbookid', $qb->createNamedParameter($ids, \OCP\DB\QueryBuilder\IQueryBuilder::PARAM_INT_ARRAY)));
		$rows = [];
		foreach ($qb->executeQuery()->fetchAll(\PDO::FETCH_COLUMN) as $d) {
			$rows[] = is_resource($d) ? (string)stream_get_contents($d) : (string)$d;
		}
		return $rows;
	}

	/** Karte lesen; null, wenn sie weder „Eltern:“ noch „Kinder:“ enthält (kein Familieneintrag). */
	public static function parse(string $vcard): ?array {
		try {
			$card = Reader::read($vcard, Reader::OPTION_FORGIVING);
		} catch (\Throwable $e) {
			return null;
		}
		$note = trim((string)($card->NOTE ?? ''));
		$hasP = (bool)preg_match('/Eltern\s*:/iu', $note);
		$hasC = (bool)preg_match('/Kinder\s*:/iu', $note);
		if (!$hasP && !$hasC) {
			return null;
		}
		$emails = [];
		foreach ($card->select('EMAIL') as $e) {
			$v = strtolower(trim((string)$e));
			if ($v !== '') {
				$emails[] = $v;
			}
		}
		$parents = [];
		$children = [];
		$ignored = [];
		$issues = [];
		if ($hasP && preg_match('/Eltern\s*:\s*(.*?)(?=Kinder\s*:|$)/isu', $note, $m)) {
			foreach (preg_split('/\s*[;\\\\\n]+\s*/u', trim($m[1])) as $p) {
				$p = trim(preg_replace('/\(.*?\)/u', '', $p));
				if ($p !== '') {
					$parents[] = $p;
				}
			}
		}
		if ($hasC && preg_match('/Kinder\s*:\s*(.*)$/isu', $note, $m)) {
			foreach (preg_split('/\s*[;\\\\\n]+\s*/u', trim($m[1])) as $c) {
				$c = trim($c);
				if ($c === '') {
					continue;
				}
				$name = trim(preg_split('/\s*[(,]/u', $c, 2)[0]);
				if (preg_match('/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/u', $c, $d) && checkdate((int)$d[2], (int)$d[1], (int)$d[3]) && $name !== '') {
					$children[] = ['name' => $name, 'born' => sprintf('%04d-%02d-%02d', $d[3], $d[2], $d[1])];
				} else {
					$ignored[] = $c;
				}
			}
		}
		if (!$hasC) {
			$issues[] = 'Keine Zeile „Kinder:“ in der Notiz.';
		} elseif (!$children) {
			$issues[] = 'Kein Kind mit Geburtsdatum (Schreibweise: „Vorname (geb. TT.MM.JJJJ)“).';
		}
		if (!$emails) {
			$issues[] = 'Keine Mailadresse auf der Karte, die Familie kann nicht melden.';
		}
		return [
			'uid' => trim((string)($card->UID ?? '')),
			'name' => trim((string)($card->FN ?? '')),
			'emails' => array_values(array_unique($emails)),
			'parents' => $parents,
			'children' => $children,
			'ignored' => $ignored,
			'hasParentsLine' => $hasP,
			'hasChildrenLine' => $hasC,
			'issues' => $issues,
		];
	}
}
