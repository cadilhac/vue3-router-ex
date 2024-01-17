import { defineConfig } from 'vite'
import { resolve } from "path";
import vue from '@vitejs/plugin-vue'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue()
  ],
  build: {
    lib: {
      // src/indext.ts is where we have exported the component(s)
      entry: resolve(__dirname, "src/index.js"),
      name: "vue3-router-ex",
      // the name of the output files when the build is run
      fileName: "vue3-router-ex",
    },
    rollupOptions: {
      // make sure to externalize deps that shouldn't be bundled
      // into your library
      external: [
        "vue",
        "@vueuse/core",
        "vue-router"
      ],
      output: {
        // intro: 'import \'./style.css\';', // Doesn't work -> Error when building

        // Provide global variables to use in the UMD build
        // for externalized deps
        globals: {
          vue: "Vue",
          'vue-router': "VueRouter"
        },
      },
    },
  },
});
