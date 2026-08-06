#!/usr/bin/env sh

url="https://x344g-ziaaa-aaaap-abl7a-cai.icp0.io/versions/${MOPS_VERSION:-latest}.tgz"

uninstall() {
	echo "Uninstalling previous version"
	npm remove -g ic-mops >/dev/null 2>&1
	pnpm remove -g ic-mops >/dev/null 2>&1
	# bun remove -g ic-mops >/dev/null 2>&1
}

install_with_npm() {
	echo "Installing mops with npm..."
	npm add -g --no-fund --no-audit $url || exit 1
}

install_with_pnpm() {
	echo "Installing mops with pnpm..."
	# ignore cache to always get the latest version
	pnpm add -g "${url}?$(awk 'BEGIN{print srand(srand())}')" || exit 1
}

install_with_bun() {
	# bug with `mops self update`
	echo "Bun is not recommended for installing mops. Please use npm or pnpm."
	exit 1
}

# uninstall previous version
if command -v mops >/dev/null 2>&1; then
	uninstall
fi

# use specified package manager
if [ "$PM" = "npm" ]; then
	install_with_npm
elif [ "$PM" = "pnpm" ]; then
	install_with_pnpm
elif [ "$PM" = "bun" ]; then
	install_with_bun
# use the first package manager found
else
	if command -v npm >/dev/null 2>&1; then
		install_with_npm
	elif command -v pnpm >/dev/null 2>&1; then
		install_with_pnpm
	elif command -v bun >/dev/null 2>&1; then
		install_with_bun
	else
		echo "No Node.js package manager found. Please install npm or pnpm"
		exit 1
	fi
fi

GREEN='\033[0;32m'
NC='\033[0m'

echo "${GREEN}Installation complete${NC}"