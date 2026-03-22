"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const index_1 = require("./index");
const mapper = new index_1.DOMMapper({
    sourceDir: "C:\\Users\\2862775\\Desktop\\UOMO-Ecommerce",
    startCommand: "npm start",
    targetUrl: "http://localhost:3000",
    port: 3000,
    timeoutMs: 300000,
});
(async () => {
    const mappings = await mapper.runMapping();
    console.log(JSON.stringify(mappings, null, 2));
})();
//# sourceMappingURL=runner.js.map