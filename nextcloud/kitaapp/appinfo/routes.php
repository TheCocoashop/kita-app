<?php

declare(strict_types=1);

return [
	'routes' => [
		['name' => 'page#index', 'url' => '/', 'verb' => 'GET'],
		['name' => 'page#manifest', 'url' => '/manifest.webmanifest', 'verb' => 'GET'],
		['name' => 'putz#state', 'url' => '/api/putz', 'verb' => 'GET'],
		['name' => 'putz#create', 'url' => '/api/putz/swap', 'verb' => 'POST'],
		['name' => 'putz#respond', 'url' => '/api/putz/swap/{id}/{antwort}', 'verb' => 'POST'],
		['name' => 'absence#state', 'url' => '/api/absence', 'verb' => 'GET'],
		['name' => 'absence#check', 'url' => '/api/absence/check', 'verb' => 'GET'],
		['name' => 'absence#create', 'url' => '/api/absence', 'verb' => 'POST'],
		['name' => 'absence#cancel', 'url' => '/api/absence/{id}/cancel', 'verb' => 'POST'],
		['name' => 'announcement#index', 'url' => '/api/ank', 'verb' => 'GET'],
		['name' => 'announcement#create', 'url' => '/api/ank', 'verb' => 'POST'],
		['name' => 'announcement#update', 'url' => '/api/ank/{id}', 'verb' => 'PUT'],
		['name' => 'announcement#destroy', 'url' => '/api/ank/{id}', 'verb' => 'DELETE'],
		['name' => 'diary#index', 'url' => '/api/diary', 'verb' => 'GET'],
		['name' => 'diary#draft', 'url' => '/api/diary/draft', 'verb' => 'PUT'],
		['name' => 'diary#photos', 'url' => '/api/diary/photos', 'verb' => 'GET'],
		['name' => 'diary#photo', 'url' => '/api/diary/photo', 'verb' => 'GET'],
		['name' => 'diary#publish', 'url' => '/api/diary/publish', 'verb' => 'POST'],
		['name' => 'file#show', 'url' => '/datei/{id}/{name}', 'verb' => 'GET', 'requirements' => ['id' => '\d+'], 'defaults' => ['name' => '']],
		['name' => 'announcement#image', 'url' => '/api/ank/{id}/image', 'verb' => 'GET'],
	],
];
