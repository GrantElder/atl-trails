/** @param {import('@11ty/eleventy').UserConfig} eleventyConfig */
module.exports = function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy("src/css");
  eleventyConfig.addPassthroughCopy("CNAME");

  // ARCHITECTURE.md: design doc, copy as-is (don't process as page)
  eleventyConfig.ignores.add("ARCHITECTURE.md");
  eleventyConfig.addPassthroughCopy("ARCHITECTURE.md");

  return {
    dir: {
      input: "src",
      output: "docs",
      includes: "_includes",
      data: "_data",
    },
    // For GitHub Pages project site: pathPrefix: "/atltrails"
    pathPrefix: process.env.PATH_PREFIX || "",
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
  };
};
