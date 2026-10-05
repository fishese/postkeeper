// Threads uses div/span layout rather than article markup. Readability merges its
// conversation with chrome, or drops short replies. Extract only loaded post cards.
export function extractThreadsPosts(document: Document, pageUrl: string): string | null {
  const url = new URL(pageUrl);
  if (!/^(www\.)?threads\.(com|net)$/iu.test(url.hostname)) return null;
  const postPath = (value: string | null): string | null => {
    if (!value) return null;
    try {
      const link = new URL(value, pageUrl);
      return /^(www\.)?threads\.(com|net)$/iu.test(link.hostname) &&
        /^\/@[^/]+\/post\/[^/]+\/?$/u.test(link.pathname)
        ? link.pathname.replace(/\/$/u, '')
        : null;
    } catch {
      return null;
    }
  };
  const target = postPath(pageUrl);
  if (!target) return null;
  const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]')).filter((link) =>
    postPath(link.getAttribute('href')),
  );
  const cards: { card: Element; path: string; link: HTMLAnchorElement }[] = [];
  const seen = new Set<string>();
  for (const link of links) {
    const path = postPath(link.getAttribute('href'))!;
    if (seen.has(path)) continue;
    // Signed-in pages expose this boundary. For public pages, find the smallest
    // ancestor containing the timestamp header and a language-tagged post body.
    let card: Element | null = link.closest('[data-pressable-container], article');
    if (!card) {
      card = link.parentElement;
      while (card && !card.querySelector('[lang]')) card = card.parentElement;
    }
    if (!card || card === document.body || !card.querySelector('[lang]')) continue;
    const paths = new Set(
      Array.from(card.querySelectorAll('a[href]'))
        .map((anchor) => postPath(anchor.getAttribute('href')))
        .filter(Boolean),
    );
    // Avoid whole-conversation containers and quoted posts being emitted twice.
    if (paths.size !== 1) continue;
    seen.add(path);
    cards.push({ card, path, link });
  }
  const primary = cards.find((entry) => entry.path === target);
  if (!primary) return null;
  const article = document.createElement('article');
  const appendPost = ({ card, path, link }: (typeof cards)[number]) => {
    const entry = document.createElement('section');
    const header = document.createElement('p');
    const author = document.createElement('strong');
    const name = path.split('/')[1];
    author.textContent = name;
    header.append(author);
    const date = link.querySelector('time')?.textContent?.trim() || link.textContent?.trim();
    if (date) {
      const timestamp = document.createElement('small');
      timestamp.textContent = ` · ${date}`;
      header.append(timestamp);
    }
    entry.append(header);
    for (const body of Array.from(card.querySelectorAll<HTMLElement>('[lang]'))) {
      const parentBody = body.parentElement?.closest('[lang]');
      if (parentBody && card.contains(parentBody)) continue;
      const copy = body.cloneNode(true) as HTMLElement;
      for (const chrome of Array.from(
        copy.querySelectorAll('button, [role="button"], svg, [hidden], [aria-hidden="true"]'),
      ))
        chrome.remove();
      // The top-level dir=auto span contains author text; its nested divs are
      // translation/part-number UI. Keep inline links but omit those controls.
      for (const span of Array.from(copy.querySelectorAll('span[dir="auto"]'))) {
        for (const control of Array.from(span.querySelectorAll('div'))) control.remove();
      }
      // Flatten layout wrappers so the resulting paragraph is valid HTML.
      for (const wrapper of Array.from(copy.querySelectorAll('div'))) {
        wrapper.replaceWith(...Array.from(wrapper.childNodes));
      }
      // Newlines in text nodes depend on website CSS. Encode them as real breaks
      // before the sanitizer removes producer styles.
      const walker = document.createTreeWalker(copy, 4 /* SHOW_TEXT */);
      const nodes: Text[] = [];
      while (walker.nextNode()) nodes.push(walker.currentNode as Text);
      for (const node of nodes) {
        if (!node.data.includes('\n')) continue;
        const fragment = document.createDocumentFragment();
        node.data.split('\n').forEach((line, index) => {
          if (index) fragment.append(document.createElement('br'));
          fragment.append(document.createTextNode(line));
        });
        node.replaceWith(fragment);
      }
      if (copy.textContent?.trim() || copy.querySelector('img')) {
        const paragraph = document.createElement('p');
        paragraph.append(...Array.from(copy.childNodes));
        entry.append(paragraph);
      }
    }
    for (const image of Array.from(card.querySelectorAll<HTMLImageElement>('img'))) {
      const textBody = image.closest('[lang]');
      if (
        (textBody && card.contains(textBody)) ||
        image.closest('[hidden], [aria-hidden="true"]') ||
        /profile picture/iu.test(image.alt) ||
        (Number(image.getAttribute('width')) > 0 && Number(image.getAttribute('width')) <= 64)
      )
        continue;
      const figure = document.createElement('figure');
      figure.append(image.cloneNode(true));
      entry.append(figure);
    }
    article.append(entry);
  };
  appendPost(primary);
  const replies = cards.filter(
    (entry) =>
      entry !== primary &&
      // Threads marks recommendations separately from the post conversation.
      !entry.card.closest('[data-pagelet*="related"], [data-pagelet*="recommended"]'),
  );
  if (replies.length) {
    const heading = document.createElement('h2');
    heading.textContent = 'Replies';
    article.append(heading);
    for (const reply of replies.slice(0, 100)) appendPost(reply);
  }
  return article.outerHTML;
}
