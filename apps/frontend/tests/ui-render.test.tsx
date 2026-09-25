import assert from "node:assert/strict";
import test from "node:test";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import HomePage from "../src/app/page";
import DashboardPage from "../src/app/dashboard/page";
import SettingsPage from "../src/app/settings/page";
import { AppNav } from "../src/app/app-nav";

function render(component: () => ReactNode) {
  return renderToStaticMarkup(createElement(component));
}

test("shared navigation exposes the product routes, skip target and footer wordmark", () => {
  const home = render(HomePage);
  const nav = render(AppNav);
  assert.match(home, /id="main"/);
  assert.match(nav, /href="#main">Skip to content/);
  assert.match(nav, /aria-label="Primary navigation"/);
  for (const route of ["/dashboard", "/settings", "/login"]) {
    assert.ok(nav.includes(`href="${route}"`), `${route} is navigable`);
  }
  assert.equal((home.match(/Elova<span aria-hidden="true"> ✳<\/span>/g) ?? []).length, 2);
});

test("unauthenticated dashboard and settings initially show loading state, not synthetic data or credential form", () => {
  const dashboard = render(DashboardPage);
  const settings = render(SettingsPage);
  assert.match(dashboard, /Loading current execution evidence/);
  assert.match(settings, /Loading connections/);
  assert.doesNotMatch(dashboard, /Recent executions<\/h2>/);
  assert.doesNotMatch(settings, /name="apiKey"/);
});
