import { defineBlogCollection } from "cms/content";

// Site-owned editors: the CMS ships the collection shape, the site names its authors.
const blog = defineBlogCollection({ authors: ["jeflopo", "aflopo"] });

export const collections = { blog };
