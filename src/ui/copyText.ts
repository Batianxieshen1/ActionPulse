/**
 * 复制文本。
 *
 * 为什么不能只用 navigator.clipboard：它要求**安全上下文**，
 * 而手机通过 http + 局域网 IP 访问时 isSecureContext === false（本项目实测过）。
 * 只写 Clipboard API 的话，手机上「一键复制战报」就是个按了没反应的哑按钮。
 * 所以这里做能力探测并按序降级。
 */
export async function copyText(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // 落到下面的降级路径
    }
  }

  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.top = "0";
    area.style.opacity = "0";
    document.body.append(area);
    area.focus();
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  } catch {
    return false;
  }
}
