import { describe, it, expect } from "vitest";
import { getUserInitial, type CurrentUser } from "@/state/auth";

describe("getUserInitial", () => {
  it("returns '?' for null user", () => {
    expect(getUserInitial(null)).toBe("?");
  });

  it("returns '?' for undefined user", () => {
    expect(getUserInitial(undefined)).toBe("?");
  });

  it("returns first letter of name when available", () => {
    const user: CurrentUser = {
      email: "test@example.com",
      name: "Leo Klemet",
      roles: [],
    };
    expect(getUserInitial(user)).toBe("L");
  });

  it("returns uppercase first letter of name", () => {
    const user: CurrentUser = {
      email: "test@example.com",
      name: "alice",
      roles: [],
    };
    expect(getUserInitial(user)).toBe("A");
  });

  it("falls back to email when name is missing", () => {
    const user: CurrentUser = {
      email: "bob@example.com",
      name: null,
      roles: [],
    };
    expect(getUserInitial(user)).toBe("B");
  });

  it("falls back to email when name is empty string", () => {
    const user: CurrentUser = {
      email: "charlie@example.com",
      name: "",
      roles: [],
    };
    expect(getUserInitial(user)).toBe("C");
  });

  it("falls back to email when name is whitespace only", () => {
    const user: CurrentUser = {
      email: "dave@example.com",
      name: "   ",
      roles: [],
    };
    expect(getUserInitial(user)).toBe("D");
  });

  it("returns '?' when both name and email are empty", () => {
    const user: CurrentUser = {
      email: "",
      name: null,
      roles: [],
    };
    expect(getUserInitial(user)).toBe("?");
  });

  it("handles name with leading/trailing spaces", () => {
    const user: CurrentUser = {
      email: "test@example.com",
      name: "  Emma  ",
      roles: [],
    };
    expect(getUserInitial(user)).toBe("E");
  });

  it("handles email with uppercase letters", () => {
    const user: CurrentUser = {
      email: "Frank@example.com",
      name: null,
      roles: [],
    };
    expect(getUserInitial(user)).toBe("F");
  });

  it("handles special characters in name", () => {
    const user: CurrentUser = {
      email: "test@example.com",
      name: "Ñora González",
      roles: [],
    };
    expect(getUserInitial(user)).toBe("Ñ");
  });

  it("handles user with picture_url", () => {
    const user: CurrentUser = {
      email: "grace@example.com",
      name: "Grace Hopper",
      picture_url: "https://lh3.googleusercontent.com/...",
      roles: [],
    };
    expect(getUserInitial(user)).toBe("G");
  });

  it("handles legacy picture field", () => {
    const user: CurrentUser = {
      email: "henry@example.com",
      name: "Henry",
      picture: "https://example.com/avatar.jpg",
      roles: [],
    };
    expect(getUserInitial(user)).toBe("H");
  });

  it("preserves case for uppercase name", () => {
    const user: CurrentUser = {
      email: "test@example.com",
      name: "IGOR",
      roles: [],
    };
    expect(getUserInitial(user)).toBe("I");
  });

  it("handles numeric email start", () => {
    const user: CurrentUser = {
      email: "123test@example.com",
      name: null,
      roles: [],
    };
    expect(getUserInitial(user)).toBe("1");
  });

  it("handles unicode characters in email", () => {
    const user: CurrentUser = {
      email: "ñ.user@example.com",
      name: null,
      roles: [],
    };
    expect(getUserInitial(user)).toBe("Ñ");
  });

  // NEW: Server-provided initial tests (prevents client flicker)
  it("prefers server-provided initial over name", () => {
    const user: CurrentUser = {
      email: "test@example.com",
      name: "Alice",
      initial: "A",  // Server already computed
      roles: [],
    };
    expect(getUserInitial(user)).toBe("A");
  });

  it("prefers server-provided initial over email", () => {
    const user: CurrentUser = {
      email: "bob@example.com",
      name: null,
      initial: "B",  // Server already computed
      roles: [],
    };
    expect(getUserInitial(user)).toBe("B");
  });

  it("uppercases server-provided initial", () => {
    const user: CurrentUser = {
      email: "test@example.com",
      name: "Charlie",
      initial: "c",  // Lowercase from server (edge case)
      roles: [],
    };
    expect(getUserInitial(user)).toBe("C");
  });

  it("falls back to name when server initial is missing", () => {
    const user: CurrentUser = {
      email: "test@example.com",
      name: "David",
      initial: undefined,  // Server didn't provide
      roles: [],
    };
    expect(getUserInitial(user)).toBe("D");
  });

  it("handles RTL/Unicode initial from server", () => {
    const user: CurrentUser = {
      email: "test@example.com",
      name: "Łeo",  // Polish Ł
      initial: "Ł",  // Server computed correctly
      roles: [],
    };
    expect(getUserInitial(user)).toBe("Ł");
  });

  it("handles whitespace-only name with server initial", () => {
    const user: CurrentUser = {
      email: "test@example.com",
      name: "   ",  // Whitespace only
      initial: "T",  // Server fell back to email
      roles: [],
    };
    expect(getUserInitial(user)).toBe("T");
  });
});
