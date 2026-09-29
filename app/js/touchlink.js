// Transport between the TV (host) and the phone (remote).
//
// Both halves talk to the local relay in tools/touch-relay.mjs: POST to
// /pair/msg to send, EventSource on /pair/listen to receive. No backend account,
// no WebRTC signalling, no camera on the TV.

const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no O/0/I/1 to misread

export function newRoom() {
  const b = new Uint8Array(4);
  crypto.getRandomValues(b);
  return Array.from(b, (n) => ROOM_ALPHABET[n % ROOM_ALPHABET.length]).join("");
}

export const isLocalHost = () => ["localhost", "127.0.0.1", "::1", ""].includes(location.hostname);

export class TouchLink {
  /**
   * @param {"tv"|"phone"} role
   * @param {{room?:string, onMessage?:(type:string,data:any,from:string)=>void,
   *          onPeer?:(online:boolean)=>void, onState?:(s:string)=>void}} opts
   */
  constructor(role, { room = newRoom(), onMessage, onPeer, onState } = {}) {
    this.role = role;
    this.room = room;
    this.onMessage = onMessage || (() => {});
    this.onPeer = onPeer || (() => {});
    this.onState = onState || (() => {});
    this.es = null;
    this.open = false;
  }

  connect() {
    this.onState("connecting");
    const q = `room=${encodeURIComponent(this.room)}&role=${this.role}`;
    const es = new EventSource(`/pair/listen?${q}`);
    this.es = es;

    es.onopen = () => {
      this.open = true;
      this.onState("connected");
    };
    es.onerror = () => {
      this.open = false;
      this.onState("offline");
    };
    es.onmessage = (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (msg.t === "peer") {
        this.onPeer(!!msg.online);
      } else if (msg.t === "msg" && msg.from !== this.role) {
        this.onMessage(msg.type, msg.data, msg.from);
      }
    };
    return this;
  }

  send(type, data) {
    if (!this.open) return false;
    const body = JSON.stringify({ room: this.room, role: this.role, type, data });
    return fetch("/pair/msg", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    })
      .then(() => true)
      .catch(() => false);
  }

  close() {
    try {
      this.es?.close();
    } catch {}
    this.open = false;
  }
}
