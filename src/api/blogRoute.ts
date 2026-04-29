import { Router, Request, Response } from "express";
import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";
import { marked } from "marked";

const router = Router();
const CONTENT_DIR = join(__dirname, "../../content/blog");

interface PostMeta {
  slug: string;
  title: string;
  date: string;
  excerpt: string;
}

function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { meta: {}, body: raw };
  const meta: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    meta[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
  }
  return { meta, body: match[2] };
}

function getAllPosts(): PostMeta[] {
  if (!existsSync(CONTENT_DIR)) return [];
  return readdirSync(CONTENT_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      const slug = f.replace(/\.md$/, "");
      const { meta } = parseFrontmatter(readFileSync(join(CONTENT_DIR, f), "utf-8"));
      return { slug, title: meta.title ?? slug, date: meta.date ?? "", excerpt: meta.excerpt ?? "" };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  } catch {
    return iso;
  }
}

const NAV = `
<nav class="site-nav">
  <a href="/" class="nav-brand"><span class="wheel-glyph">☸</span>Monk in Your Pocket</a>
  <div class="nav-links">
    <a href="/" class="nav-hide-sm">Home</a>
    <a href="/about.html" class="nav-hide-sm">About</a>
    <a href="/blog" class="active nav-hide-sm">Blog</a>
    <a href="/donate.html" class="nav-hide-sm">Support</a>
    <a href="/chat.html" class="nav-cta">Begin</a>
  </div>
</nav>`;

const FOOTER = `
<footer class="site-footer">
  <span class="footer-wheel">☸</span>
  Monk in Your Pocket draws on the Bhikkhu Sujato translations of the Pāli Canon via SuttaCentral.<br>
  Not a substitute for a teacher, community, or mental health care.
  <div class="footer-links">
    <a href="/">Home</a>
    <a href="/chat.html">Chat</a>
    <a href="/about.html">About</a>
    <a href="/blog">Blog</a>
    <a href="/donate.html">Support</a>
  </div>
</footer>`;

const HEAD = (title: string) => `
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>${title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="stylesheet" href="/css/site.css"/>`;

// GET /blog — post listing
router.get("/", (_req: Request, res: Response) => {
  const posts = getAllPosts();

  const cards = posts.length === 0
    ? `<p style="color:var(--text-muted);font-style:italic;">No posts yet.</p>`
    : posts.map((p) => `
      <a href="/blog/${p.slug}" class="post-card fade-up">
        <time class="post-date">${formatDate(p.date)}</time>
        <h2 class="post-title">${p.title}</h2>
        <p class="post-excerpt">${p.excerpt}</p>
        <span class="post-read">Read →</span>
      </a>`).join("");

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>${HEAD("Blog — Monk in Your Pocket")}
<style>
  .blog-hero {
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    padding: 3.5rem 2rem 3rem;
    text-align: center;
  }
  .blog-hero h1 {
    font-family: var(--font-display);
    font-size: 2.6rem;
    font-weight: 300;
    color: var(--heading);
    margin-bottom: 0.6rem;
  }
  .blog-hero p { font-size: 1rem; color: var(--text-muted); font-style: italic; }

  .post-list {
    max-width: 760px;
    margin: 0 auto;
    padding: 3rem 2rem 5rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }
  .post-card {
    display: block;
    padding: 1.75rem 2rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    text-decoration: none;
    transition: all 0.2s;
  }
  .post-card:hover {
    background: var(--saffron-pale);
    border-color: var(--saffron-light);
    transform: translateY(-2px);
    box-shadow: var(--shadow);
    text-decoration: none;
  }
  .post-date { font-size: 0.8rem; color: var(--text-light); letter-spacing: 0.05em; display: block; margin-bottom: 0.5rem; }
  .post-title { font-family: var(--font-display); font-size: 1.5rem; font-weight: 400; color: var(--heading); margin-bottom: 0.6rem; line-height: 1.25; }
  .post-excerpt { font-size: 0.93rem; color: var(--text-muted); line-height: 1.65; margin-bottom: 0.75rem; }
  .post-read { font-size: 0.83rem; color: var(--saffron-deep); }
  @media (max-width: 640px) { .post-list { padding: 2rem 1.25rem 4rem; } }
</style>
</head>
<body>
${NAV}
<div class="blog-hero fade-up">
  <h1>Writings</h1>
  <p>My own personal reflections on practice, design, and the project.</p>
</div>
<div class="post-list">${cards}</div>
${FOOTER}
<script>
  const fadeEls = document.querySelectorAll('.fade-up');
  const obs = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.style.animationPlayState='running'; obs.unobserve(e.target); }}), {threshold:0.1});
  fadeEls.forEach(el => { el.style.animationPlayState='paused'; obs.observe(el); });
</script>
</body>
</html>`);
});

// GET /blog/:slug — individual post
router.get("/:slug", (req: Request, res: Response) => {
  const slug = Array.isArray(req.params.slug) ? req.params.slug[0] : req.params.slug;

  // Prevent path traversal
  if (!/^[a-z0-9-]+$/.test(slug)) {
    res.status(404).send("Not found");
    return;
  }

  const filePath = join(CONTENT_DIR, `${slug}.md`);
  if (!existsSync(filePath)) {
    res.status(404).send("Post not found");
    return;
  }

  const raw = readFileSync(filePath, "utf-8");
  const { meta, body } = parseFrontmatter(raw);
  const htmlBody = marked(body) as string;

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>${HEAD(`${meta.title ?? slug} — Monk in Your Pocket`)}
<style>
  .post-hero {
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    padding: 3.5rem 2rem 3rem;
    max-width: 760px;
    margin: 0 auto;
  }
  .post-hero time { font-size: 0.82rem; color: var(--text-light); letter-spacing: 0.05em; display: block; margin-bottom: 0.75rem; }
  .post-hero h1 {
    font-family: var(--font-display);
    font-size: clamp(1.8rem, 4vw, 2.8rem);
    font-weight: 300;
    color: var(--heading);
    line-height: 1.2;
    margin-bottom: 0.75rem;
  }
  .post-hero .post-excerpt { font-size: 1rem; color: var(--text-muted); font-style: italic; }

  .post-body {
    max-width: 760px;
    margin: 0 auto;
    padding: 3rem 2rem 5rem;
  }
  .post-nav {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.75rem 0 0;
    margin-top: 2.5rem;
    border-top: 1px solid var(--border);
    font-size: 0.88rem;
  }
  @media (max-width: 640px) { .post-hero, .post-body { padding-left: 1.25rem; padding-right: 1.25rem; } }
</style>
</head>
<body>
${NAV}
<div class="post-hero fade-up">
  ${meta.date ? `<time>${formatDate(meta.date)}</time>` : ""}
  <h1>${meta.title ?? slug}</h1>
  ${meta.excerpt ? `<p class="post-excerpt">${meta.excerpt}</p>` : ""}
</div>
<div class="post-body prose fade-up delay-1">
  ${htmlBody}
  <div class="post-nav">
    <a href="/blog">← All writings</a>
    <a href="/chat.html" class="btn btn-primary" style="padding:0.55rem 1.1rem;font-size:0.88rem;">Begin a conversation</a>
  </div>
</div>
${FOOTER}
<script>
  const fadeEls = document.querySelectorAll('.fade-up');
  const obs = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.style.animationPlayState='running'; obs.unobserve(e.target); }}), {threshold:0.1});
  fadeEls.forEach(el => { el.style.animationPlayState='paused'; obs.observe(el); });
</script>
</body>
</html>`);
});

export default router;
