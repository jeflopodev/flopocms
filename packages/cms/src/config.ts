import type { BlockDefinition } from "blocks/types";

export interface CmsAuthor {
  id: string;
  name: string;
  avatar?: string;
  bio?: string;
}

export interface CmsTemplate {
  id: string;
  label: string;
}

export interface CmsSettingsConfig {
  schema?: any;
  defaults?: Record<string, any>;
}

export interface CmsThemeConfig {
  brandName?: string;
  brandColor?: string;
  logoUrl?: string;
}

export interface CmsConfig {
  siteName?: string;
  contentDir?: string;
  uploadsDir?: string;
  authors?: CmsAuthor[] | string[];
  blocks?: BlockDefinition[];
  templates?: CmsTemplate[];
  settings?: CmsSettingsConfig;
  theme?: CmsThemeConfig;
}

let activeConfig: CmsConfig = {};

/**
 * Declares site-specific CMS configuration.
 */
export function defineConfig(config: CmsConfig): CmsConfig {
  activeConfig = config;
  return config;
}

/**
 * Retrieves the currently active CMS configuration for the site.
 */
export function getCmsConfig(): CmsConfig {
  return activeConfig;
}

/**
 * Sets or overrides the active CMS configuration (e.g. during integration setup).
 */
export function setCmsConfig(config: CmsConfig): void {
  activeConfig = config;
}
