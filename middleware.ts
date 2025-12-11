export const config = {
  matcher: '/gallery/:path*',
  runtime: 'edge',
};

export default async function middleware(request: Request) {
  const url = new URL(request.url);
  const segments = url.pathname.split('/');
  const id = segments[segments.length - 1];

  if (!id || id.includes('.')) {
    return fetch(request);
  }

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    const apiUrl = `${supabaseUrl}/rest/v1/saved_images?id=eq.${id}&select=image_url,caption`;
    
    const dbResponse = await fetch(apiUrl, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!dbResponse.ok) return fetch(request);

    const data = await dbResponse.json();
    const image = data && data.length > 0 ? data[0] : null;

    if (!image) return fetch(request);

    const indexResponse = await fetch(new URL('/index.html', request.url));
    const html = await indexResponse.text();

    const safeTitle = (image.caption || 'StoryBoard AI').replace(/"/g, '&quot;').substring(0, 50);
    const description = `Check out this comic panel: "${safeTitle}..."`;
    const imageUrl = image.image_url;

    const newMetaTags = `
      <title>${safeTitle}</title>
      <meta property="og:title" content="${safeTitle}" />
      <meta property="og:description" content="${description}" />
      <meta property="og:image" content="${imageUrl}" />
      <meta property="og:image:width" content="1024" />
      <meta property="og:image:height" content="1024" />
      
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content="${safeTitle}" />
      <meta name="twitter:description" content="${description}" />
      <meta name="twitter:image" content="${imageUrl}" />
    `;

    // 【关键修改】在插入新标签前，先用正则把旧的标签“洗掉”
    // 这样能确保 HTML 里只有一套正确的标签，防止 Twitter 抓错
    let cleanedHtml = html
      .replace(/<title>.*?<\/title>/g, '')
      .replace(/<meta property="og:title".*?>/g, '')
      .replace(/<meta property="og:description".*?>/g, '')
      .replace(/<meta property="og:image".*?>/g, '')
      .replace(/<meta name="twitter:title".*?>/g, '')
      .replace(/<meta name="twitter:description".*?>/g, '')
      .replace(/<meta name="twitter:image".*?>/g, '')
      .replace(/<meta name="twitter:card".*?>/g, '');

    // 将清洗后的 HTML 插入新标签
    const modifiedHtml = cleanedHtml.replace('</head>', `${newMetaTags}</head>`);

    return new Response(modifiedHtml, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      },
    });

  } catch (error) {
    console.error('Middleware Error:', error);
    return fetch(request);
  }
}