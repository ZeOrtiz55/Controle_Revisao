import { NextRequest, NextResponse } from "next/server";
import { ImapFlow } from "imapflow";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const uid = searchParams.get("uid");
  const part = searchParams.get("part");
  const filename = searchParams.get("filename") || "anexo";
  const contentType = searchParams.get("type") || "application/octet-stream";

  if (!uid || !part) {
    return NextResponse.json(
      { error: "Parâmetros uid e part são obrigatórios." },
      { status: 400 }
    );
  }

  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;

  if (!user || !pass) {
    return NextResponse.json(
      { error: "Credenciais do Gmail não configuradas." },
      { status: 500 }
    );
  }

  try {
    const client = new ImapFlow({
      host: "imap.gmail.com",
      port: 993,
      secure: true,
      auth: { user, pass },
      logger: false,
    });

    await client.connect();
    const lock = await client.getMailboxLock("[Gmail]/E-mails enviados");

    try {
      const { content } = await client.download(uid, part, { uid: true });

      // Bufferar conteúdo para permitir visualização inline no iframe
      const chunks: Buffer[] = [];
      for await (const chunk of content) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const buffer = Buffer.concat(chunks);

      lock.release();
      await client.logout();

      const headers = new Headers();
      headers.set("Content-Type", contentType);
      headers.set("Content-Length", buffer.length.toString());
      headers.set("Content-Disposition", `inline; filename="${encodeURIComponent(filename)}"`);
      headers.set("Cache-Control", "private, max-age=86400, immutable");

      return new Response(buffer, { status: 200, headers });
    } catch (err) {
      try { lock.release(); } catch {}
      try { await client.logout(); } catch {}
      throw err;
    }
  } catch (error: any) {
    console.error("Erro ao baixar anexo:", error);
    return NextResponse.json(
      { error: "Falha ao baixar anexo." },
      { status: 500 }
    );
  }
}
