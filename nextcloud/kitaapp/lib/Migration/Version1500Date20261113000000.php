<?php

declare(strict_types=1);

namespace OCA\KitaApp\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\DB\Types;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

/** Tabelle für das Modul „Abwesenheit“: nur Vorname, Zeitraum und Art, kein Freitext. */
class Version1500Date20261113000000 extends SimpleMigrationStep {
	public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper {
		/** @var ISchemaWrapper $schema */
		$schema = $schemaClosure();
		if ($schema->hasTable('kitaapp_absence')) {
			return null;
		}
		$t = $schema->createTable('kitaapp_absence');
		$t->addColumn('id', Types::BIGINT, ['autoincrement' => true, 'notnull' => true, 'length' => 8]);
		$t->addColumn('card_uid', Types::STRING, ['notnull' => true, 'length' => 190]);
		$t->addColumn('child', Types::STRING, ['notnull' => true, 'length' => 128]);
		$t->addColumn('group_name', Types::STRING, ['notnull' => false, 'length' => 64]);
		$t->addColumn('from_date', Types::STRING, ['notnull' => true, 'length' => 10]);
		$t->addColumn('to_date', Types::STRING, ['notnull' => true, 'length' => 10]);
		$t->addColumn('kind', Types::STRING, ['notnull' => true, 'length' => 16]);
		$t->addColumn('reported_by', Types::STRING, ['notnull' => true, 'length' => 64]);
		$t->addColumn('reported_at', Types::BIGINT, ['notnull' => true, 'length' => 8]);
		$t->addColumn('cancelled', Types::SMALLINT, ['notnull' => true, 'default' => 0]);
		$t->setPrimaryKey(['id']);
		$t->addIndex(['from_date', 'to_date'], 'kita_abs_range');
		$t->addIndex(['card_uid'], 'kita_abs_card');
		return $schema;
	}
}
