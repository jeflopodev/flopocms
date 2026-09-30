import { bindings, defineConfig } from "cf/config";

export default defineConfig({
	worker: {
		name: "flopocms",
		compatibilityDate: "2026-09-30",
		compatibilityFlags: [
			"nodejs_compat",
		],
		env: {
			CONTENT_DIR: bindings.text("src/content/blog"),
			UPLOADS_DIR: bindings.text("public/uploads"),
			DB: bindings.d1({
				name: "flopocms-d1",
				id: "8c1e6b53-e6f9-47a8-ac0d-9631b4234a48",
			}),
			ASSETS: bindings.assets(),
		},
	},
});
