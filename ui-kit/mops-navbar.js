import mopsSvg from "./mops.svg.js";

if (globalThis.location) {
	let urls = globalThis.location.href.includes("localhost")
		? {
			packages: "http://localhost:3000",
			docs: "http://localhost:3001",
			blog: "http://localhost:3002",
			cli: "http://localhost:3003",

		}
		: {
			packages: "https://mops.one",
			docs: "https://docs.mops.one",
			blog: "https://blog.mops.one",
			cli: "https://cli.mops.one",
		};

	class MyCustomElement extends HTMLElement {
		_isActive(url) {
			if (url === "https://mops.one" && globalThis.location.href.includes("localhost")) {
				return "active";
			}
			return globalThis.location.href.startsWith(url) ? "active" : "";
		}

		connectedCallback() {
			let shadow = this.attachShadow({mode: "open"});
			shadow.innerHTML = `
				<style>
					:host {
						display: flex;
						align-items: center;
						gap: 30px;
					}
					svg {
						width: 52px;
						height: 52px;
						margin: -10px 0;
					}
					nav {
						display: flex;
						gap: 10px;
						align-items: center;
						line-height: 1;
						max-width: 44vw;
						overflow-x: auto;
					}
					a {
						text-decoration: none;
						color: black;
						padding: 12px 14px;
						font-weight: 500;
						border-radius: 5px;
					}
					a.active {
						font-weight: 700;
						border-bottom: 2px solid hsl(73deg 20% 44%);
						border-bottom-left-radius: 0;
						border-bottom-right-radius: 0;
					}
					a:hover {
						background-color: #f1f1f1;
					}
					/* dark theme */
					:host-context([data-theme="dark"]) a {
						color: white;
					}
					:host-context([data-theme="dark"]) a:hover {
						background-color: #333;
					}
				</style>
				${mopsSvg}
				<nav>
					<a href="${urls.packages}" class="${this._isActive(urls.packages)}">Packages</a>
					<a href="${urls.docs}" class="${this._isActive(urls.docs)}">Docs</a>
					<a href="${urls.blog}" class="${this._isActive(urls.blog)}">Blog</a>
					<a href="${urls.cli}" class="${this._isActive(urls.cli)}">CLI releases</a>
				</nav>
			`;
		}
	}

	customElements.define("mops-navbar", MyCustomElement);
}