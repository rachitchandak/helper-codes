import { DOMMapper } from "./index";

const mapper = new DOMMapper({
    sourceDir: "C:\\Users\\2862775\\Desktop\\UOMO-Ecommerce",
    startCommand: "npm start",
    targetUrl: "http://localhost:3000",
    port: 3000,
    timeoutMs: 30_0000,
});

(async () => {
    const mappings = await mapper.runMapping();
    console.log(JSON.stringify(mappings, null, 2));
})();
