import React from "react";
import clsx from "clsx";
import styles from "./styles.module.css";

type FeatureItem = {
  title: string;
  Svg: React.ComponentType<React.ComponentProps<"svg">>;
  description: JSX.Element;
};

const FeatureList: FeatureItem[] = [
  {
    title: "On-chain website",
    Svg: require("@site/static/img/undraw_docusaurus_mountain.svg").default,
    description: (
      <>
        <a href="https://internetcomputer.org/" target="_blank">
          Internet Computer
        </a>{" "}
        blockchain can host websites, so this site and the package registry
        frontend{" "}
        <a href="https://mops.one" target="_blank">
          https://mops.one
        </a>{" "}
        are hosted on-chain.
      </>
    ),
  },
  {
    title: "On-chain package registry",
    Svg: require("@site/static/img/undraw_docusaurus_react.svg").default,
    description: (
      <>
        All package metadata and source files are stored on-chain, so you can be
        sure that the data is always available.
      </>
    ),
  },
  {
    title: "On-chain CLI",
    Svg: require("@site/static/img/undraw_docusaurus_tree.svg").default,
    description: <>Coming soon...</>,
  },
];

function Feature({ title, Svg, description }: FeatureItem) {
  return (
    <div className={clsx("col col--4")}>
      <div className="text--center">
        <Svg className={styles.featureSvg} role="img" />
      </div>
      <div className="text--center padding-horiz--md">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function HomepageFeatures(): JSX.Element {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
