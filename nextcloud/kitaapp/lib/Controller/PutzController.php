<?php

declare(strict_types=1);

namespace OCA\KitaApp\Controller;

use OCA\KitaApp\Service\PutzService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\DataResponse;
use OCP\IRequest;
use OCP\IUserSession;

class PutzController extends Controller {
	public function __construct(
		string $appName,
		IRequest $request,
		private IUserSession $userSession,
		private PutzService $putz,
	) {
		parent::__construct($appName, $request);
	}

	#[NoAdminRequired]
	public function state(): DataResponse {
		return new DataResponse($this->putz->state($this->userSession->getUser()));
	}

	#[NoAdminRequired]
	public function create(string $myUri, string $theirUri, string $message = ''): DataResponse {
		return $this->run(fn () => $this->putz->create($this->userSession->getUser(), $myUri, $theirUri, $message));
	}

	#[NoAdminRequired]
	public function respond(string $id, string $antwort): DataResponse {
		return $this->run(fn () => $this->putz->respond($this->userSession->getUser(), $id, $antwort));
	}

	/** Ausführen und den neuen Stand zurückgeben; Fehlermeldungen sind für Eltern lesbar formuliert. */
	private function run(callable $fn): DataResponse {
		try {
			$fn();
		} catch (\InvalidArgumentException|\RuntimeException $e) {
			return new DataResponse(['error' => $e->getMessage()], Http::STATUS_BAD_REQUEST);
		}
		return $this->state();
	}
}
