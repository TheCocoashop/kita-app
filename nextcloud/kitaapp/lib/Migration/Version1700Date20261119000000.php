<?php

declare(strict_types=1);

namespace OCA\KitaApp\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\DB\Types;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

/** Abwesenheit: ganztägig, kommt später oder geht früher (mit Uhrzeit). */
class Version1700Date20261119000000 extends SimpleMigrationStep {
	public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper {
		/** @var ISchemaWrapper $schema */
		$schema = $schemaClosure();
		if (!$schema->hasTable('kitaapp_absence')) {
			return null;
		}
		$t = $schema->getTable('kitaapp_absence');
		$changed = false;
		if (!$t->hasColumn('part')) {
			$t->addColumn('part', Types::STRING, ['notnull' => true, 'length' => 8, 'default' => 'day']);
			$changed = true;
		}
		if (!$t->hasColumn('at_time')) {
			$t->addColumn('at_time', Types::STRING, ['notnull' => false, 'length' => 5]);
			$changed = true;
		}
		return $changed ? $schema : null;
	}
}
