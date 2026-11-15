<?php

declare(strict_types=1);

namespace OCA\KitaApp\Service;

use OCP\IAppConfig;
use OCP\Mail\IMessage;

/**
 * Angaben zur Einrichtung. Alles steht in den App-Einstellungen (occ config:app:set kitaapp …),
 * damit andere Kindergärten die App ohne Änderung am Code nutzen können.
 *
 *   org_name         Voller Name, z. B. „Naturkindergarten Beispiel e.V.“ (Fuß von Mails)
 *   org_short        Kurzname für Absender und App-Namen
 *   mail_from        Absenderadresse für Mails der App (leer = Standard-Absender der Nextcloud)
 *   mail_contact     Adresse für Antworten und Rückfragen (leer = keine Antwortadresse)
 *   mail_it          Adresse bei Problemen mit der App, z. B. fehlende Mailadresse (leer = „meldet euch beim Team“)
 *   photo_host       Adresse der Foto-App (Immich), z. B. https://fotos.example.org (leer = Fotoauswahl aus)
 */
class OrgSettings {
	public function __construct(
		private string $appName,
		private IAppConfig $config,
	) {
	}

	private function get(string $key, string $default = ''): string {
		return trim($this->config->getValueString($this->appName, $key, $default));
	}

	public function name(): string {
		return $this->get('org_name', 'Kindergarten');
	}

	public function shortName(): string {
		return $this->get('org_short', 'Kindergarten');
	}

	public function mailFrom(): string {
		return $this->get('mail_from');
	}

	public function mailContact(): string {
		return $this->get('mail_contact');
	}

	public function mailIt(): string {
		return $this->get('mail_it');
	}

	public function photoHost(): string {
		return rtrim($this->get('photo_host'), '/');
	}

	/** Absender und Antwortadresse setzen, soweit eingestellt. */
	public function applySender(IMessage $msg): void {
		if ($this->mailFrom() !== '') {
			$msg->setFrom([$this->mailFrom() => $this->shortName()]);
		}
		if ($this->mailContact() !== '') {
			$msg->setReplyTo([$this->mailContact() => $this->shortName()]);
		}
	}

	/** Hinweis für Eltern, deren Familie nicht gefunden wird. */
	public function helpHint(): string {
		return $this->mailIt() !== '' ? 'Bitte schreibt an ' . $this->mailIt() : 'Bitte meldet euch beim Team';
	}
}
