import Nat "mo:base/Nat";
import Iter "mo:base/Iter";
import Text "mo:base/Text";
import HttpTypes "mo:http-types";
import Registry "./registry/Registry";

module {
  public func documentation() : Text {
    "<svg xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink' width='100' height='20' role='img' aria-label='documentation'>
<title>documentation</title><linearGradient id='s' x2='0' y2='100%'><stop offset='0' stop-color='#bbb' stop-opacity='.1'/><stop offset='1' stop-opacity='.1'/></linearGradient>
<clipPath id='r'><rect width='100' height='20' rx='3' fill='#fff'/></clipPath>
<g clip-path='url(#r)'>
<rect width='100' height='20' fill='#007ec6'/>
<rect width='100' height='20' fill='url(#s)'/></g>
<g fill='#fff' text-anchor='middle' font-family='Verdana,Geneva,DejaVu Sans,sans-serif' text-rendering='geometricPrecision' font-size='110'>
<text x='495' y='150' fill='#010101' fill-opacity='.3' transform='scale(.1)' textLength='875' aria-hidden='true'>documentation</text>
<text x='495' y='140' transform='scale(.1)' fill='#fff' textLength='875'>documentation</text></g></svg>";
  };

  public func mops(version : Text) : Text {
    let title = "mops: " # version;
    let key = "mops";
    let val = version;
    let valTextLength = Nat.toText(64 * val.size());
    "<svg xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" width=\"100\" height=\"20\" role=\"img\" aria-label=\"" # title # "\">
<title>" # title # "</title>
<linearGradient id=\"s\" x2=\"0\" y2=\"100%\">
<stop offset=\"0\" stop-color=\"#bbb\" stop-opacity=\".1\"/>
<stop offset=\"1\" stop-opacity=\".1\"/>
</linearGradient><clipPath id=\"r\">
<rect width=\"100\" height=\"20\" rx=\"3\" fill=\"#fff\"/></clipPath><g clip-path=\"url(#r)\">
<rect width=\"50\" height=\"20\" fill=\"#555\"/>
<rect x=\"50\" width=\"60\" height=\"20\" fill=\"#007ec6\"/>
<rect width=\"100\" height=\"20\" fill=\"url(#s)\"/></g>
<g fill=\"#fff\" text-anchor=\"middle\" font-family=\"Verdana,Geneva,DejaVu Sans,sans-serif\" text-rendering=\"geometricPrecision\" font-size=\"110\">
<text x=\"250\" y=\"150\" transform=\"scale(.1)\" fill=\"#010101\" fill-opacity=\".3\" textLength=\"340\" aria-hidden=\"true\">" # key # "</text>
<text x=\"250\" y=\"140\" transform=\"scale(.1)\" fill=\"#fff\" textLength=\"340\">" # key # "</text>
<text x=\"745\" y=\"150\" transform=\"scale(.1)\" fill=\"#010101\" fill-opacity=\".3\" textLength=\"" # valTextLength # "\" aria-hidden=\"true\">" # val # "</text>
<text x=\"745\" y=\"140\" transform=\"scale(.1)\" fill=\"#fff\" textLength=\"" # valTextLength # "\">" # val # "</text></g></svg>";
  };

  public func processHttpRequest(registry : Registry.Registry, request : HttpTypes.Request) : ?HttpTypes.Response {
    let path = Iter.toArray(Text.split(request.url, #text("?")))[0];
    let parts = Iter.toArray(Text.split(path, #text("/")));
    let badgePath = parts[1];
    let badgeName = parts[2];
    let packageName = if (parts.size() > 3) parts[3] else "";

    if (badgePath != "badge") {
      return null;
    };

    let badge = switch (badgeName) {
      case ("documentation") {
        documentation();
      };
      case ("mops") {
        let ?highestVersion = registry.getHighestVersion(packageName) else {
          return null;
        };
        mops(highestVersion);
      };
      case (_) {
        return null;
      };
    };

    return ?{
      status_code = 200;
      headers = [
        ("Content-Type", "image/svg+xml"),
        // ("Cache-Control", "max-age=0, no-cache, no-store, must-revalidate, private"),
        ("Cache-Control", "max-age=600, s-maxage=600"), // 10 minutes
      ];
      body = Text.encodeUtf8(badge);
      streaming_strategy = null;
      upgrade = null;
    };
  };
};
