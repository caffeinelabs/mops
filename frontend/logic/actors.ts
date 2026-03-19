import { Principal } from "@dfinity/principal";
import {
  createActor as createMainActor,
  canisterId as mainCanisterId,
} from "/declarations/main";
import { createActor as createStorageActor } from "/declarations/storage";

let getOptions = () => {
  return {
    agentOptions: {
      host:
        process.env.NODE_ENV === "production"
          ? "https://icp-api.io"
          : "http://localhost:4943",
      verifyQuerySignatures: false,
    },
  };
};

export let mainActor = () => {
  return createMainActor(mainCanisterId, getOptions());
};

export let storageActor = (storageId: string | Principal) => {
  return createStorageActor(storageId, getOptions());
};

declare global {
  // eslint-disable-next-line no-unused-vars, no-var
  var getStoragesStats: () => void;
}

window.getStoragesStats = () => {
  mainActor()
    .getStoragesStats()
    .then((statsAr) => {
      console.log(
        statsAr.map(([principal, stats]) => {
          return [principal.toText(), stats];
        }),
      );
    });
};
