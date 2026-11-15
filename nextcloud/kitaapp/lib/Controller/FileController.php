<?php

declare(strict_types=1);

namespace OCA\KitaApp\Controller;

use OCP\AppFramework\Controller;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\DataDisplayResponse;
use OCP\AppFramework\Http\DataResponse;
use OCP\Files\File;
use OCP\Files\IRootFolder;
use OCP\IRequest;
use OCP\IUserSession;

/**
 * PDF-Dateien (und Bilder) direkt im Browser anzeigen, z. B. Laternenlieder aus dem Ordner „4 Eltern“.
 * Der Nextcloud-Dateibetrachter ist auf dem iPhone unzuverlässig; hier liefert Safari das PDF selbst aus.
 * getById() sieht nur Dateien, auf die der angemeldete Nutzer ohnehin Zugriff hat.
 */
class FileController extends Controller {
	public function __construct(
		string $appName,
		IRequest $request,
		private IUserSession $userSession,
		private IRootFolder $root,
	) {
		parent::__construct($appName, $request);
	}

	#[NoAdminRequired]
	#[NoCSRFRequired]
	public function show(int $id, string $name = ''): Http\Response {
		$user = $this->userSession->getUser();
		$file = $user ? ($this->root->getUserFolder($user->getUID())->getById($id)[0] ?? null) : null;
		$mime = $file instanceof File ? $file->getMimeType() : '';
		if (!$file instanceof File || ($mime !== 'application/pdf' && !str_starts_with($mime, 'image/'))) {
			return new DataResponse([], Http::STATUS_NOT_FOUND);
		}
		$safe = str_replace(['"', "\r", "\n", '\\'], '', $file->getName());
		$response = new DataDisplayResponse($file->getContent(), Http::STATUS_OK, [
			'Content-Type' => $mime,
			'Content-Disposition' => 'inline; filename*=UTF-8\'\'' . rawurlencode($safe),
		]);
		$response->cacheFor(3600, false, true);
		return $response;
	}
}
