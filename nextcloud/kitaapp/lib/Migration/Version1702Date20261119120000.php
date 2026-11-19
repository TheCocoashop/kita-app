<?php

declare(strict_types=1);

namespace OCA\KitaApp\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\DB\Types;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

/** Abwesenheit: kurze freie Anmerkung bei „sonstiges“ (zum Beispiel Arzttermin um 9 Uhr). */
class Version1702Date20261119120000 extends SimpleMigrationStep {
	public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper {
		/** @var ISchemaWrapper $schema */
		$schema = $schemaClosure();
		if (!$schema->hasTable('kitaapp_absence')) {
			return null;
		}
		$t = $schema->getTable('kitaapp_absence');
		if ($t->hasColumn('note')) {
			return null;
		}
		$t->addColumn('note', Types::STRING, ['notnull' => false, 'length' => 80]);
		return $schema;
	}
}
