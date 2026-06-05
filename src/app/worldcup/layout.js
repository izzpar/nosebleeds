// Server layout for the /worldcup/* routes — gives shared links (including
// group invite links) a proper title/description when pasted into chats.
export const metadata = {
  title: "Fantasy World Cup 2026 · The Nosebleeds",
  description:
    "Draft nations or players, run a live auction, build a salary-cap XI, and rank all 48 teams. Free fantasy games for the 2026 World Cup — play with your friends.",
  openGraph: {
    title: "Fantasy World Cup 2026 · The Nosebleeds",
    description: "Draft, auction, salary cap & power ranking — free, with friends.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Fantasy World Cup 2026 · The Nosebleeds",
    description: "Draft, auction, salary cap & power ranking — free, with friends.",
  },
};

export default function WorldCupLayout({ children }) {
  return children;
}
