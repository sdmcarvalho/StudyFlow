// Corpo de resposta com MP3 já em memória, sem cópia. `new Response(buffer)` copia o ArrayBuffer inteiro no
// undici; um ReadableStream entrega VISTAS (subarray) dos Buffers guardados na tarefa, em pedaços, conforme o
// cliente lê. Os Buffers das tarefas nunca são alterados depois de prontos, então as vistas são seguras.
const CHUNK = 256 * 1024;

/** Os bytes de `parts`, na ordem, como um fluxo de pedaços de até 256 KB (vistas, sem cópia). */
export function bytesStream(parts: readonly Uint8Array[]): ReadableStream<Uint8Array> {
  let part = 0;
  let offset = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      while (part < parts.length && offset >= parts[part].byteLength) {
        part++;
        offset = 0;
      }
      if (part >= parts.length) {
        controller.close();
        return;
      }
      const current = parts[part];
      const end = Math.min(offset + CHUNK, current.byteLength);
      controller.enqueue(current.subarray(offset, end));
      offset = end;
    },
  });
}
