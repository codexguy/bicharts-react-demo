import { fileURLToPath, URL } from 'node:url';

import { defineConfig, type ServerOptions } from 'vite';
import plugin from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import child_process from 'child_process';
import { env } from 'process';

// The HTTPS dev server the Visual Studio template expects. Only `vite` (serve) needs it, so it
// is built on demand: a production build - including the GitHub Pages workflow, which has no
// ASP.NET dev certificate to export - never touches the certificate store.
function devServer(): ServerOptions {
    const baseFolder =
        env.APPDATA !== undefined && env.APPDATA !== ''
            ? `${env.APPDATA}/ASP.NET/https`
            : `${env.HOME}/.aspnet/https`;

    const certificateName = "reactapp1.client";
    const certFilePath = path.join(baseFolder, `${certificateName}.pem`);
    const keyFilePath = path.join(baseFolder, `${certificateName}.key`);

    if (!fs.existsSync(baseFolder)) {
        fs.mkdirSync(baseFolder, { recursive: true });
    }

    if (!fs.existsSync(certFilePath) || !fs.existsSync(keyFilePath)) {
        if (0 !== child_process.spawnSync('dotnet', [
            'dev-certs',
            'https',
            '--export-path',
            certFilePath,
            '--format',
            'Pem',
            '--no-password',
        ], { stdio: 'inherit', }).status) {
            throw new Error("Could not create certificate.");
        }
    }

    const target = env.ASPNETCORE_HTTPS_PORT ? `https://localhost:${env.ASPNETCORE_HTTPS_PORT}` :
        env.ASPNETCORE_URLS ? env.ASPNETCORE_URLS.split(';')[0] : 'https://localhost:7166';

    return {
        proxy: {
            '^/weatherforecast': {
                target,
                secure: false
            }
        },
        port: parseInt(env.DEV_SERVER_PORT || '10391'),
        https: {
            key: fs.readFileSync(keyFilePath),
            cert: fs.readFileSync(certFilePath),
        }
    };
}

// https://vitejs.dev/config/
// @bicharts/chart-host is an INSTALLED PACKAGE resolved from the public registry. No aliases:
// the demo resolves it exactly as a stranger's app would, which is the only way this demo can
// prove anything about the package. An earlier source-alias arrangement hid two real defects -
// a tarball with no shape-core in it, and a bundle that threw "React is not defined" - because
// an alias compiles the package's source under THIS app's settings rather than consuming what
// is published.
//
// DEMO_BASE is the public path the build is served under. GitHub Pages serves a project site
// at /<repo>/, so the Pages workflow sets it; a local build or `npm run dev` leaves it at '/'.
export default defineConfig(({ command }) => ({
    base: env.DEMO_BASE || '/',
    plugins: [plugin()],
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url)),
            // React stays pinned to this app's copy: the package takes React as an OPTIONAL
            // peer, and hooks require a single React instance across the boundary.
            'react': fileURLToPath(new URL('./node_modules/react', import.meta.url)),
            'react-dom': fileURLToPath(new URL('./node_modules/react-dom', import.meta.url)),
        }
    },
    server: command === 'serve' ? devServer() : undefined,
}));
