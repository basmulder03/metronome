import { mount } from 'svelte';
import App from './App.svelte';
import './shared/ui/tokens.css';
import './shared/ui/base.css';
import { applyTheme, getTheme } from './shared/ui/theme';

applyTheme(getTheme()); // before mount, so there is no flash of the wrong theme
mount(App, { target: document.getElementById('app')! });
