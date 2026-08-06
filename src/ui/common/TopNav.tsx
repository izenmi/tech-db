import { NavLink } from "react-router-dom";

const LINKS = [
  { to: "/works", label: "本を探す" },
  { to: "/techs", label: "技術スタック" },
  { to: "/themes", label: "テーマ" },
  { to: "/authors", label: "著者" },
  { to: "/translators", label: "翻訳者" },
  { to: "/publishers", label: "出版社" },
  { to: "/awards", label: "アワード" },
  { to: "/timeline", label: "年表" },
  { to: "/search", label: "横断検索" },
];

export function TopNav() {
  return (
    <header className="top-nav">
      <div className="top-nav__inner">
        <NavLink to="/" className="top-nav__title font-display">
          技術書DB
        </NavLink>
        <ul className="top-nav__links">
          {LINKS.map((link) => (
            <li key={link.to}>
              <NavLink to={link.to} className={({ isActive }) => (isActive ? "active" : undefined)}>
                {link.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </div>
    </header>
  );
}
