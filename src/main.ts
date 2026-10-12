import { mount } from 'svelte';
import App from './App.svelte';
import './shared/ui/tokens.css';
import './shared/ui/base.css';
import { registerSW } from 'virtual:pwa-register';
import { applyTheme, getTheme } from './shared/ui/theme';

registerSW({ immediate: true }); // offline support; the plugin leaves the service worker out of `vite dev`
applyTheme(getTheme()); // before mount, so there is no flash of the wrong theme
mount(App, { target: document.getElementById('app')! });
