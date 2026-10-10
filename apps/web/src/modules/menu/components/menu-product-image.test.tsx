import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { MenuProductImage } from "./menu-product-image";
import { safeMenuImage } from "../menu-image";
afterEach(cleanup);
it("rejects unsafe references and supplies an accessible alternative", () => {
  for (const value of [
    "javascript:alert(1)",
    "//other.test/image",
    "https://user:password@other.test/image",
    "http://other.test/image",
    "/bad\\image",
  ])
    expect(safeMenuImage(value)).toBeNull();
  render(<MenuProductImage name="Pad Thai" imageReference={null} />);
  expect(
    screen.getByRole("img", { name: "Imagen no disponible para Pad Thai" }),
  ).toBeInTheDocument();
});
it("replaces failed images without losing the product name", () => {
  render(
    <MenuProductImage name="Pad Thai" imageReference="/fixture-dish.png" />,
  );
  fireEvent.error(screen.getByRole("img", { name: "Pad Thai" }));
  expect(
    screen.getByRole("img", { name: "Imagen no disponible para Pad Thai" }),
  ).toBeInTheDocument();
});
