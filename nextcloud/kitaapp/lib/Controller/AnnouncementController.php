<?php

declare(strict_types=1);

namespace OCA\KitaApp\Controller;

use OCA\KitaApp\Service\AnnouncementService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\DataDisplayResponse;
use OCP\AppFramework\Http\DataResponse;
use OCP\IRequest;
use OCP\IUserSession;

class AnnouncementController extends Controller {
	public function __construct(
		string $appName,
		IRequest $request,
		private IUserSession $userSession,
		private AnnouncementService $service,
	) {
		parent::__construct($appName, $request);
	}

	#[NoAdminRequired]
	public function index(): DataResponse {
		return new DataResponse($this->service->forUser($this->userSession->getUser()));
	}

	#[NoAdminRequired]
	public function create(string $title = '', string $text = '', string $validFrom = '', string $validUntil = '', string $buttonLabel = '', string $buttonHref = '', ?string $image = null, bool $notify = false): DataResponse {
		$data = compact('title', 'text', 'validFrom', 'validUntil', 'buttonLabel', 'buttonHref', 'image', 'notify');
		return $this->run(fn () => $this->service->store($this->userSession->getUser(), null, $data));
	}

	#[NoAdminRequired]
	public function update(string $id, string $title = '', string $text = '', string $validFrom = '', string $validUntil = '', string $buttonLabel = '', string $buttonHref = '', ?string $image = null, bool $removeImage = false, bool $notify = false): DataResponse {
		$data = compact('title', 'text', 'validFrom', 'validUntil', 'buttonLabel', 'buttonHref', 'image', 'removeImage', 'notify');
		return $this->run(fn () => $this->service->store($this->userSession->getUser(), $id, $data));
	}

	#[NoAdminRequired]
	public function destroy(string $id): DataResponse {
		return $this->run(fn () => $this->service->delete($this->userSession->getUser(), $id));
	}

	/** Bild der Meldung; nur für angemeldete Nutzer. */
	#[NoAdminRequired]
	#[NoCSRFRequired]
	public function image(string $id): Http\Response {
		$img = $this->service->image($id);
		if (!$img) {
			return new DataResponse([], Http::STATUS_NOT_FOUND);
		}
		$response = new DataDisplayResponse($img[0], Http::STATUS_OK, ['Content-Type' => $img[1]]);
		$response->cacheFor(3600, false, true);
		return $response;
	}

	private function run(callable $fn): DataResponse {
		try {
			$result = $fn();
		} catch (\InvalidArgumentException $e) {
			return new DataResponse(['error' => $e->getMessage()], Http::STATUS_BAD_REQUEST);
		}
		return new DataResponse($this->service->forUser($this->userSession->getUser()) + ['mailed' => is_int($result) ? $result : 0]);
	}
}
