import Translator, { Replacements, LangOptions } from 'lang.js';
import { VueConstructor } from 'vue';

/*
|--------------------------------------------------------------------------
| Types & Interfaces
|--------------------------------------------------------------------------
*/

type TranslateFunction = (key: string, replacements?: Replacements, locale?: string) => string;
type IgnoreList = Map<string, string[]>;

interface Translations {
	// eg. fr.auth
	[localeDotDomain: string]: {
		[key: string]: string;
	};
}

interface Options extends LangOptions {
	ignore: IgnoreList;
	globalTranslationsKey: string;
}

/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

/**
 * Determines if the given locale and domain combination is ignored.
 */
function shouldIgnore(ignore: IgnoreList, locale: string, domain: string) {
	for (let [ignoreLocale, ignoreDomains] of Object.entries(ignore)) {
		if (locale === ignoreLocale && ignoreDomains.includes(domain)) {
			return true;
		}
	}

	return false;
}

/**
 * Imports translations from the configured alias.
 */
function importTranslations({ ignore, globalTranslationsKey }: Partial<Options>): Translations {
	const catalogue: Translations = {};
	const files = require.context('@lang', true, /\.(php|json)$/);

	files.keys().forEach((file: string) => {
		// Find localization files at the root directory
		const [isGlobal, rootLocale] = /\.\/([A-Za-z0-9-_]+).(?:php|json)/.exec(file) ?? [];

		if (isGlobal) {
			catalogue[`${rootLocale}.${globalTranslationsKey}`] = files(file);

			return;
		}

		// Find localization files in a /lang/ directory
		const [isScoped, locale, domain] =
			/\.\/([A-Za-z0-9-_]+)\/([A-Za-z0-9-_]+).(?:php|json)/.exec(file) ?? [];

		if (!ignore || !shouldIgnore(ignore, locale, domain)) {
			catalogue[`${locale}.${domain}`] = files(file);
		}
	});

	return catalogue;
}

/*
 |--------------------------------------------------------------------------
 | Vue plugin
 |--------------------------------------------------------------------------
 */

/**
 * Augments vue.
 */
declare module 'vue/types/vue' {
	interface Vue {
		$lang: () => Translator;
		__: TranslateFunction;
	}
}

/**
 * Adds localization to Vue.
 */
const Lang = {
	install: (Vue: VueConstructor, options: Partial<Options> = {}) => {
		// Defines default options
		options = {
			globalTranslationsKey: '__global__',
			...options,
		};

		// Creates the Lang.js object
		const i18n = new Translator({
			fallback: document.documentElement.lang || navigator.language,
			messages: options?.messages ?? importTranslations(options),
			...options,
		});

		// Defines a global translation function
		const __: TranslateFunction = (key, ...args) => {
			// Non-global translations
			if (key.match(/^[\w-]+(?:\.[\w-]+)+$/)) {
				return i18n.get(key, ...args);
			}

			// Global translations
			const result = i18n.get(`${options.globalTranslationsKey}.${key}`, ...args);

			return result.startsWith(options.globalTranslationsKey!)
				? result.substr(options.globalTranslationsKey!.length + 1)
				: result;
		};

		Vue.mixin({
			methods: {
				$lang: () => i18n,
				__,
			},
		});
	},
};

export { Lang as default, Lang };
