// @ts-check
// Note: type annotations allow type checking and IDEs autocompletion

const lightCodeTheme = require('prism-react-renderer/themes/github');
const darkCodeTheme = require('prism-react-renderer/themes/dracula');

/** @type {import('@docusaurus/types').Config} */
const config = {
	title: 'Mops Docs',
	tagline: 'The most supercharged package manager ever!',
	favicon: 'img/logo.svg',

	// Set the production url of your site here
	url: 'https://docs.mops.one',
	// Set the /<baseUrl>/ pathname under which your site is served
	// For GitHub pages deployment, it is often '/<projectName>/'
	baseUrl: '/',

	// GitHub pages deployment config.
	// If you aren't using GitHub pages, you don't need these.
	organizationName: 'facebook', // Usually your GitHub org/user name.
	projectName: 'docusaurus', // Usually your repo name.

	onBrokenLinks: 'throw',
	onBrokenMarkdownLinks: 'warn',

	// Even if you don't use internalization, you can use this field to set useful
	// metadata like html lang. For example, if your site is Chinese, you may want
	// to replace "en" with "zh-Hans".
	i18n: {
		defaultLocale: 'en',
		locales: ['en'],
	},

	presets: [
		[
			'classic',
			/** @type {import('@docusaurus/preset-classic').Options} */
			({
				docs: {
					routeBasePath: '/',
					sidebarPath: require.resolve('./sidebars.js'),
					// Please change this to your repo.
					// Remove this to remove the "edit this page" links.
					editUrl: 'https://github.com/dfinity/mops/edit/main/docs/',
				},
				blog: false,
				theme: {
					customCss: require.resolve('./src/css/custom.css'),
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
				theme: lightCodeTheme,
				darkTheme: darkCodeTheme,
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

module.exports = config;
