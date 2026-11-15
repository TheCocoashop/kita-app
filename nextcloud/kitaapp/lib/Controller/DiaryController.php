<?php

declare(strict_types=1);

namespace OCA\KitaApp\Controller;

use OCA\KitaApp\Service\DiaryService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\DataDisplayResponse;
use OCP\AppFramework\Http\DataResponse;
use OCP\IRequest;
use OCP\IUserSession;

class DiaryController extends Controller {
	public function __construct(
		string $appName,
		IRequest $request,
		private IUserSession $userSession,
		private DiaryService $service,
	) {
		parent::__construct($appName, $request);
	}

	#[NoAdminRequired]
	public function index(): DataResponse {
		return new DataResponse($this->service->state($this->userSession->getUser()));
	}

	#[NoAdminRequired]
	public function draft(string $title = '', string $text = '', string $link = '', string $cover = ''): DataResponse {
		$in = ['title' => $title, 'text' => $text, 'link' => $link, 'cover' => $cover];
		return $this->run(function () use ($in) {
			$this->service->saveDraft($this->userSession->getUser(), $in);
			return 0;
		});
	}

	#[NoAdminRequired]
	public function photos(string $link = ''): DataResponse {
		try {
			return new DataResponse($this->service->photos($this->userSession->getUser(), $link));
		} catch (\InvalidArgumentException $e) {
			return new DataResponse(['error' => $e->getMessage()], Http::STATUS_BAD_REQUEST);
		}
	}

	#[NoAdminRequired]
	public function photo(string $link = '', string $id = ''): DataDisplayResponse {
		try {
			$bytes = $this->service->photo($this->userSession->getUser(), $link, $id);
		} catch (\Throwable $e) {
			return new DataDisplayResponse('', Http::STATUS_NOT_FOUND);
		}
		$resp = new DataDisplayResponse($bytes, Http::STATUS_OK, ['Content-Type' => 'image/webp']);
		$resp->cacheFor(3600, false, true);
		return $resp;
	}

	#[NoAdminRequired]
	public function publish(string $title = '', string $text = '', string $link = '', string $cover = '', bool $notify = false): DataResponse {
		$in = ['title' => $title, 'text' => $text, 'link' => $link, 'cover' => $cover];
		return $this->run(fn () => $this->service->publish($this->userSession->getUser(), $in, $notify));
	}

	private function run(callable $fn): DataResponse {
		try {
			$mailed = $fn();
		} catch (\InvalidArgumentException $e) {
			return new DataResponse(['error' => $e->getMessage()], Http::STATUS_BAD_REQUEST);
		}
		return new DataResponse(['ok' => true, 'mailed' => $mailed]);
	}
}
