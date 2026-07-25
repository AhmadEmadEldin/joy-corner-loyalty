import { render, screen } from "@testing-library/react";
import { ProductImage } from "./ProductImage";

describe("ProductImage", () => {
  it("renders an image when src is provided", () => {
    render(<ProductImage alt="Cappuccino" src="/cappuccino.jpg" />);
    const img = screen.getByRole("img", { name: "Cappuccino" });
    expect(img).toBeTruthy();
    expect(img.getAttribute("src")).toBe("/cappuccino.jpg");
    expect(img.getAttribute("loading")).toBe("lazy");
  });

  it("shows a placeholder when no src is provided", () => {
    render(<ProductImage alt="Latte" />);
    const placeholder = screen.getByRole("img", { name: "Latte" });
    expect(placeholder).toBeTruthy();
    expect(placeholder.querySelector("img")?.getAttribute("src")).toContain("image/svg+xml");
  });

  it("applies CSS custom properties for focal point and zoom", () => {
    const { container } = render(
      <ProductImage alt="Mocha" positionX={30} positionY={70} src="/mocha.jpg" zoom={1.5} />,
    );
    const wrapper = container.querySelector(".product-image-wrap") as HTMLElement;
    expect(wrapper).toBeTruthy();
    const style = wrapper.style;
    expect(style.getPropertyValue("--img-x")).toBe("30%");
    expect(style.getPropertyValue("--img-y")).toBe("70%");
    expect(style.getPropertyValue("--img-zoom")).toBe("1.5");
  });

  it("clamps out-of-range position and zoom values", () => {
    const { container } = render(
      <ProductImage alt="Espresso" positionX={-10} positionY={150} src="/espresso.jpg" zoom={5} />,
    );
    const wrapper = container.querySelector(".product-image-wrap") as HTMLElement;
    expect(wrapper.style.getPropertyValue("--img-x")).toBe("0%");
    expect(wrapper.style.getPropertyValue("--img-y")).toBe("100%");
    expect(wrapper.style.getPropertyValue("--img-zoom")).toBe("2.5");
  });

  it("defaults to 50/50 and zoom 1", () => {
    const { container } = render(<ProductImage alt="Mocha" src="/mocha.jpg" />);
    const wrapper = container.querySelector(".product-image-wrap") as HTMLElement;
    expect(wrapper.style.getPropertyValue("--img-x")).toBe("50%");
    expect(wrapper.style.getPropertyValue("--img-y")).toBe("50%");
    expect(wrapper.style.getPropertyValue("--img-zoom")).toBe("1");
  });

  it("applies custom className", () => {
    const { container } = render(
      <ProductImage alt="Matcha" className="custom-class" src="/matcha.jpg" />,
    );
    const wrapper = container.querySelector(".product-image-wrap.custom-class");
    expect(wrapper).toBeTruthy();
  });

  it("sets correct dimensions for sm size", () => {
    const { container } = render(
      <ProductImage alt="Espresso" size="sm" src="/espresso.jpg" />,
    );
    const wrapper = container.querySelector(".product-image-wrap") as HTMLElement;
    expect(wrapper.style.width).toBe("130px");
    expect(wrapper.style.height).toBe("100px");
  });

  it("sets correct dimensions for lg size", () => {
    const { container } = render(
      <ProductImage alt="Espresso" size="lg" src="/espresso.jpg" />,
    );
    const wrapper = container.querySelector(".product-image-wrap") as HTMLElement;
    expect(wrapper.style.width).toBe("380px");
    expect(wrapper.style.height).toBe("280px");
  });
});
