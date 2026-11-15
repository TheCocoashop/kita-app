<?php

declare(strict_types=1);

namespace OCA\KitaApp\Controller;

use OCA\KitaApp\Service\AbsenceService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\DataResponse;
use OCP\IRequest;
use OCP\IUserSession;

class AbsenceController extends Controller {
	public function __construct(
		string $appName,
		IRequest $request,
		private IUserSession $userSession,
		private AbsenceService $absence,
	) {
		parent::__construct($appName, $request);
	}

	#[NoAdminRequired]
	public function state(): DataResponse {
		return new DataResponse($this->absence->state($this->userSession->getUser()));
	}

	#[NoAdminRequired]
	public function create(string $child, string $from, string $to, string $kind): DataResponse {
		return $this->run(fn () => $this->absence->report($this->userSession->getUser(), $child, $from, $to, $kind));
	}

	#[NoAdminRequired]
	public function cancel(int $id): DataResponse {
		return $this->run(fn () => $this->absence->cancel($this->userSession->getUser(), $id));
	}

	#[NoAdminRequired]
	public function check(): DataResponse {
		try {
			return new DataResponse($this->absence->check($this->userSession->getUser()));
		} catch (\RuntimeException $e) {
			return new DataResponse(['error' => $e->getMessage()], Http::STATUS_FORBIDDEN);
		}
	}

	private function run(callable $fn): DataResponse {
		try {
			$fn();
		} catch (\InvalidArgumentException|\RuntimeException $e) {
			return new DataResponse(['error' => $e->getMessage()], Http::STATUS_BAD_REQUEST);
		}
		return $this->state();
	}
}
