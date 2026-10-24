import {
	Configuration,
	BuildsApi,
	KeyboardsApi,
	KeycapSetsApi,
	LookupsApi,
	ProfilesApi,
	SwitchesApi
} from '@rogueserenity/kbdb-api-client';
import { PUBLIC_KBDB_API_BASE_PATH } from '$app/env/public';
import { getAccessToken } from '#lib/auth/auth.svelte.js';
import { retryWhenThrottled } from './throttle.js';

const configuration = new Configuration({
	basePath: PUBLIC_KBDB_API_BASE_PATH,
	accessToken: getAccessToken,
	middleware: [retryWhenThrottled()]
});

export const buildsApi = new BuildsApi(configuration);
export const keyboardsApi = new KeyboardsApi(configuration);
export const keycapSetsApi = new KeycapSetsApi(configuration);
export const lookupsApi = new LookupsApi(configuration);
export const profilesApi = new ProfilesApi(configuration);
export const switchesApi = new SwitchesApi(configuration);
