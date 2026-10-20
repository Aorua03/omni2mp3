<template>
  <div id="app">
    <div class="page-orbit page-orbit--one"></div>
    <div class="page-orbit page-orbit--two"></div>

    <header class="app-header">
      <a class="brand" href="#app" aria-label="回到页面顶部">
        <span class="brand__disc"><i></i></span>
        <span>Omni2MP3</span>
      </a>
      <span class="privacy-pill">音频本地处理 · 匿名使用统计</span>
    </header>

    <main>
      <section class="hero" aria-labelledby="page-title">
        <p class="hero__eyebrow">OMNI2MP3 / BROWSER ONLY / v{{ version }}</p>
        <h1 id="page-title">把音乐文件<br /><em>变成 MP3格式</em></h1>
      </section>

      <Home />
    </main>

    <footer class="app-footer">
      <div>
        <strong>Omni2MP3</strong>
        <span>适合 OpenSwim Pro：转换后用随附数据线传入耳机。该型号不能通过蓝牙传歌。</span>
      </div>
      <div class="app-footer__links">
        <a href="https://git.unlock-music.dev/um/web" target="_blank" rel="noreferrer" @click="trackFooterLink('footer_upstream')">原始项目</a>
        <a href="./LICENSE.txt" target="_blank" rel="noreferrer" @click="trackFooterLink('footer_license')">MIT 许可</a>
      </div>
      <p>基于 Unlock Music 与 music-batch-unlock 的开源代码；仅处理你有权使用的本地文件。无法读取的受保护文件会提示失败。</p>
    </footer>
  </div>
</template>

<script>
import config from '@/../package.json';
import Home from '@/view/Home';
import { initializeAnalytics, track } from '@/utils/analytics';

export default {
  name: 'App',
  components: { Home },
  data() {
    return { version: config.version };
  },
  mounted() {
    initializeAnalytics(config.version);
    track('app_opened');
    const mask = document.getElementById('loader-mask');
    if (mask) mask.remove();
  },
  methods: {
    trackFooterLink(controlId) {
      track('control_clicked', { control_id: controlId, area: 'footer' });
    },
  },
};
</script>

<style lang="scss">
@import 'scss/unlock-music';
</style>
