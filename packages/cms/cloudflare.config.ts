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
			// Site-agnostic on purpose: the content repo this deployment writes
			// to arrives via environment (CI: GitHub Actions Variables, manual:
			// `GITHUB_REPO=owner/repo cf deploy --prebuilt`), never as a literal
			// naming a site in this engine repo. Absent means GitHub-backed
			// writes are disabled (see Services.contents).
			GITHUB_REPO: bindings.text(process.env.GITHUB_REPO ?? ""),
			DB: bindings.d1({ id: "8c1e6b53-e6f9-47a8-ac0d-9631b4234a48",
			}),
			ASSETS: bindings.assets(),
		},
	},
});
