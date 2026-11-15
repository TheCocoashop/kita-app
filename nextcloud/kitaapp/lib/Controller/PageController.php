<?php

declare(strict_types=1);

namespace OCA\KitaApp\Controller;

use OCA\KitaApp\Service\OrgSettings;
use OCA\KitaApp\Service\PutzService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\Attribute\PublicPage;
use OCP\AppFramework\Http\JSONResponse;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\IAppConfig;
use OCP\IGroupManager;
use OCP\IRequest;
use OCP\IURLGenerator;
use OCP\IUserSession;
use OCP\Util;

class PageController extends Controller {
	public function __construct(
		string $appName,
		IRequest $request,
		private IUserSession $userSession,
		private IURLGenerator $urlGenerator,
		private IAppConfig $appConfig,
		private PutzService $putz,
		private IGroupManager $groups,
		private OrgSettings $org,
	) {
		parent::__construct($appName, $request);
	}

	/**
	 * Die Eltern-Oberfläche. Eigene, vollständige HTML-Seite ohne Nextcloud-Kopfzeile.
	 */
	#[NoAdminRequired]
	#[NoCSRFRequired]
	public function index(): TemplateResponse {
		$user = $this->userSession->getUser();

		$config = [
			'uid' => $user->getUID(),
			'displayName' => $user->getDisplayName(),
			'family' => $this->putz->familyOf($user),
			'monthView' => $this->monthView($user),
			'requesttoken' => Util::callRegister(),
			'webroot' => $this->urlGenerator->getWebroot(),
			'collective' => $this->appConfig->getValueString($this->appName, 'collective', 'Elternhandbuch'),
			// Teil des Namens: Kalender, der beim Eintragen vorausgewählt ist / Adressbuch der Elternliste
			'calendar' => $this->appConfig->getValueString($this->appName, 'calendar', 'eltern'),
			'addressbook' => $this->appConfig->getValueString($this->appName, 'addressbook', 'eltern'),
			'org' => ['name' => $this->org->shortName(), 'mailIt' => $this->org->mailIt(), 'photoHost' => $this->org->photoHost()],
		];

		$response = new TemplateResponse($this->appName, 'main', [
			'config' => json_encode($config, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
			'nonce' => $this->scriptNonce(),
			'touchIcon' => $this->touchIcon(),
			'manifest' => $this->urlGenerator->linkToRoute('kitaapp.page.manifest'),
		], TemplateResponse::RENDER_AS_BLANK);

		return $response;
	}

	/**
	 * Monatsübersicht der Termine: nur für Mitglieder der Gruppen aus `month_groups`
	 * (Standard „Vorstand,Team-Kita“) und Admins; „*“ bedeutet: alle.
	 */
	private function monthView(\OCP\IUser $user): bool {
		if ($this->groups->isAdmin($user->getUID())) {
			return true;
		}
		$names = $this->appConfig->getValueString($this->appName, 'month_groups', 'Vorstand,Team-Kita');
		if (trim($names) === '*') {
			return true;
		}
		foreach (array_filter(array_map('trim', explode(',', $names))) as $group) {
			if ($this->groups->isInGroup($user->getUID(), $group)) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Web-App-Manifest, damit „Zum Home-Bildschirm“ ein richtiges App-Icon ergibt.
	 * Öffentlich, weil Browser das Manifest ohne Anmelde-Cookies abrufen.
	 */
	#[PublicPage]
	#[NoCSRFRequired]
	public function manifest(): JSONResponse {
		$icon = $this->touchIcon();
		$response = new JSONResponse([
			'name' => 'KiTa-App – ' . $this->org->shortName(),
			'short_name' => 'KiTa',
			'start_url' => $this->urlGenerator->linkToRoute('kitaapp.page.index'),
			'scope' => $this->urlGenerator->linkToRoute('kitaapp.page.index'),
			'display' => 'standalone',
			'background_color' => '#F3F1EA',
			'theme_color' => '#2F5B40',
			'lang' => 'de',
			'icons' => [
				['src' => $icon, 'sizes' => '512x512', 'type' => 'image/png'],
			],
		]);
		$response->addHeader('Content-Type', 'application/manifest+json; charset=utf-8');
		return $response;
	}

	/**
	 * Nextcloud erlaubt Skripte nur mit dem Nonce der aktuellen Anfrage.
	 * Eine öffentliche Schnittstelle dafür gibt es nicht, daher der Griff in den Server-Kern.
	 */
	private function scriptNonce(): string {
		try {
			return \OCP\Server::get(\OC\Security\CSP\ContentSecurityPolicyNonceManager::class)->getNonce();
		} catch (\Throwable $e) {
			return '';
		}
	}

	/** Das Kita-Logo aus dem Theming als PNG-Icon (dasselbe wie beim bisherigen Homescreen-Icon). */
	private function touchIcon(): string {
		try {
			return $this->urlGenerator->linkToRoute('theming.Icon.getTouchIcon', ['app' => 'core']);
		} catch (\Throwable $e) {
			return $this->urlGenerator->imagePath($this->appName, 'app.svg');
		}
	}
}
