// @ts-check
// `@type` JSDoc annotations allow editor autocompletion and type checking
// (when paired with `@ts-check`).
// There are various equivalent ways to declare your Docusaurus config.
// See: https://docusaurus.io/docs/api/docusaurus-config

import {themes as prismThemes} from 'prism-react-renderer';

/** @type {import('@docusaurus/types').Config} */
const config = {
	title: 'Mops Blog',
	favicon: 'img/logo.svg',

	// Set the production url of your site here
	url: 'https://blog.mops.one',
	// Set the /<baseUrl>/ pathname under which your site is served
	// For GitHub pages deployment, it is often '/<projectName>/'
	baseUrl: '/',

	// GitHub pages deployment config.
	// If you aren't using GitHub pages, you don't need these.
	organizationName: 'facebook', // Usually your GitHub org/user name.
	projectName: 'docusaurus', // Usually your repo name.

	onBrokenLinks: 'throw',
	onBrokenMarkdownLinks: 'warn',

	// Even if you don't use internationalization, you can use this field to set
	// useful metadata like html lang. For example, if your site is Chinese, you
	// may want to replace "en" with "zh-Hans".
	i18n: {
		defaultLocale: 'en',
		locales: ['en'],
	},

	presets: [
		[
			'classic',
			/** @type {import('@docusaurus/preset-classic').Options} */
			({
				docs: false,
				blog: {
					showReadingTime: true,
					routeBasePath: '/',
					blogTitle: 'Mops Blog',
				},
				theme: {
					customCss: './src/css/custom.css',
				},
			}),
		],
	],

	clientModules: [
		require.resolve('../ui-kit/index.js'),
	],

	themeConfig:
		/** @type {import('@docusaurus/preset-classic').ThemeConfig} */
		({
			// Replace with your project's social card
			image: 'img/logo.svg',
			navbar: {
				items: [
					{
						type: 'html',
						value: '<mops-navbar></mops-navbar>',
					},
				],
			},
			footer: {
				style: 'dark',
				links: [
					{
						items: [
							{
								label: 'GitHub',
								href: 'https://github.com/dfinity/mops',
							},
							{
								label: 'Twitter',
								href: 'https://twitter.com/mops_one',
							},
							{
								label: 'Discord',
								href: 'https://discord.com/invite/9HNsJwaU3T',
							},
						],
					},
				],
				// copyright: `Copyright © ${new Date().getFullYear()} MOPS`,
			},
			prism: {
				theme: prismThemes.github,
				darkTheme: prismThemes.dracula,
			},
			fathomAnalytics: {
				siteId: 'THOISMFA',
			},
		}),

	plugins: [
		'docusaurus-plugin-fathom',
	],
	
	scripts: [
		{
			src: '/js/loadtags.js',
			async: false,
		},
	],
};

export default config;
