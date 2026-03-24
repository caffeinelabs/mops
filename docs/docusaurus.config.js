// @ts-check
// `@type` JSDoc annotations allow editor autocompletion and type checking
// (when paired with `@ts-check`).
// See: https://docusaurus.io/docs/api/docusaurus-config

import {themes as prismThemes} from 'prism-react-renderer';
import webpack from 'webpack';

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
	markdown: {
		hooks: {
			onBrokenMarkdownLinks: 'warn',
		},
	},

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
					sidebarPath: './sidebars.js',
					// Please change this to your repo.
					// Remove this to remove the "edit this page" links.
					editUrl: 'https://github.com/caffeinelabs/mops/edit/main/docs/',
				},
				blog: false,
				theme: {
					customCss: './src/css/custom.css',
				},
			}),
		],
	],
	clientModules: [
		'../ui-kit/index.js',
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
								href: 'https://github.com/caffeinelabs/mops',
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
		// Workaround: webpack 5.96+ broke HMR when webpack-dev-server applies
		// HotModuleReplacementPlugin after compiler creation. Adding it here
		// ensures it's in the config before compiler instantiation.
		// See: https://github.com/webpack/webpack/issues/19120
		function hmrCompatibilityFix() {
			return {
				name: 'webpack-hmr-compat',
				configureWebpack(config, isServer) {
					if (isServer || config.mode === 'production') return {};
					return {plugins: [new webpack.HotModuleReplacementPlugin()]};
				},
			};
		},
	],

	scripts: [
		{
			src: '/js/loadtags.js',
			async: false,
		},
	],
};

export default config;
