import { createApp } from "vue";
import { createRouter, createWebHashHistory } from "vue-router";
import App from "./App.vue";
import "./app/styles/base.css";

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: "/", component: () => import("./app/pages/OverlayPage.vue") },
    { path: "/settings", component: () => import("./app/pages/SettingsPage.vue") },
    { path: "/:pathMatch(.*)*", redirect: "/" },
  ],
});

createApp(App).use(router).mount("#app");
