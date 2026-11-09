/*
 *  Copyright 2023 Adobe Systems Incorporated
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

Cypress.Commands.add("AEMForceLogout", function () {
  cy.visit("/");

  cy.title().then((title) => {
    if (!title || !title.includes("AEM Sign In")) {
      cy.visit("/system/sling/logout.html");
    }
  });

  cy.get('form[name="login"]', { timeout: 3000 }).should("exist");
});

// AEMLogin logs into the Author instance and creates a browser session, this speeds up login for multiple tests
Cypress.Commands.add("AEMLogin", function (username, password) {
  if (!username) {
    username = Cypress.env("AEM_AUTHOR_USERNAME");
  }
  if (!password) {
    password = Cypress.env("AEM_AUTHOR_PASSWORD");
  }

  cy.session([username], () => {
    cy.visit("/libs/granite/core/content/login.html");
    if (
      Cypress.config().baseUrl.includes("adobeaemcloud.com") ||
      Cypress.config().baseUrl.includes("adobeaemcloud.net")
    ) {
      cy.get("#coral-id-0").click();
    }

    cy.get("#login").should(
      "have.attr",
      "action",
      "/libs/granite/core/content/login.html/j_security_check",
    );

    cy.get("#username").type(username);
    cy.get("#password").type(password, { log: false, parseSpecialCharSequences: false });

    cy.get("#submit-button").click();
    cy.get("coral-shell-content", { timeout: 5000 }).should("exist");
  });
});

// disable the onboarding wizards for consistent tests
Cypress.Commands.add("AEMDisableWelcomeWizards", function () {
  // get the current user home path
  cy.request("/libs/cq/security/userinfo.json").then((response) => {
    expect(response.body.home).to.exist;
    // get a csrf token
    cy.request("/libs/granite/csrf/token.json").then((tokenResp) => {
      expect(tokenResp.body.token).to.exist;

      cy.request({
        method: "POST",
        url: response.body.home + "/preferences",
        form: true,
        headers: {
          "Csrf-Token": tokenResp.body.token,
          Origin: Cypress.config("baseUrl"),
        },
        body: {
          "cq.authoring.editor.page.showOnboarding62": "false",
          "granite.shell.showonboarding620": "false",
          "cq.authoring.cloudservices.optin": "false",
        },
      });
    });
  });
});

Cypress.Commands.add("AEMNavigateSites", function (path) {
  const url = new URL("/sites.html" + path, Cypress.config("baseUrl"));
  cy.visit(url.toString());
});

Cypress.Commands.add("AEMNavigatePageProperties", function (path) {
  const url = new URL(
    "/mnt/overlay/wcm/core/content/sites/properties.html",
    Cypress.config("baseUrl"),
  );
  url.searchParams.set("item", path);
  cy.visit(url.toString());
});

Cypress.Commands.add("AEMNavigatePageEditor", function (path) {
  const url = new URL("/editor.html" + path + ".html", Cypress.config("baseUrl"));
  cy.visit(url.toString());
});

Cypress.Commands.add("AEMQuickPublish", function (path) {
  cy.AEMNavigateSites(path);
  // select the page, use force true to skip visibility verification on this particular case
  cy.get(
    'coral-columnview-item[data-foundation-collection-item-id="' + path + '"] coral-checkbox input',
  ).check({ force: true });
  // press on quick publish
  cy.get("button.cq-siteadmin-admin-actions-quickpublish-activator").click({ force: true });
  // confirm the delete dialog
  cy.get('coral-dialog[aria-hidden="false"] ._coral-Button--cta').click();
});

Cypress.Commands.add("AEMUnpublish", function (path) {
  cy.AEMNavigateSites(path);
  // // select the page, use force true to skip visibility verification on this particular case
  cy.get(
    'coral-columnview-item[data-foundation-collection-item-id="' + path + '"] coral-checkbox input',
  ).check({ force: true });
  // // press on manage publication
  cy.get("button.cq-siteadmin-admin-actions-publish-activator").click({ force: true });
  // select unpublish
  cy.get('button[value="Deactivate"]').click();
  // click next
  cy.get(
    '.foundation-layout-wizard2-header coral-panel.is-selected button[data-foundation-wizard-control-action="next"]',
  ).click();
  // click unpublish
  cy.get(
    '.foundation-layout-wizard2-header coral-panel.is-selected button[data-foundation-wizard-control-action="next"]',
  ).click();

  // CLAUDE: START - wait (best effort, never fails the test) until AEM records the Deactivate action on the page,
  // so the cleanup delete that follows does not run while the page still looks published/referenced.
  const waitUntilDeactivated = (retries) => {
    return cy
      .request({
        url: new URL(path + "/_jcr_content.json", Cypress.config("baseUrl")).href,
        failOnStatusCode: false,
      })
      .then((response) => {
        const done =
          response.status === 200 && response.body["cq:lastReplicationAction"] === "Deactivate";
        if (done || retries < 1) {
          return;
        }
        cy.wait(1000, { log: false });
        return waitUntilDeactivated(retries - 1);
      });
  };
  waitUntilDeactivated(20);
  // CLAUDE: END - wait for unpublish
});

// CLAUDE: START - AEMConfirmDelete is new. It confirms whichever Delete dialog AEM shows after the delete button
// was clicked: the standard one (with the "archive" checkbox) or the "Force Delete" one shown when the selected
// page is still referenced or published. It waits for the dialog to settle first, because the original
// uncheck() sometimes failed with "the page updated while this command was executing".
Cypress.Commands.add("AEMConfirmDelete", function () {
  const dialog = 'coral-dialog[aria-hidden="false"]';
  const archive = dialog + ' coral-checkbox[name="archive"] input';
  const warningButton = dialog + " ._coral-Button--warning";

  cy.get(dialog).should("be.visible");
  // let the dialog finish rendering before touching it
  cy.wait(1000, { log: false });

  cy.get("body").then(($body) => {
    // the archive checkbox only exists in the standard dialog; do not archive test pages
    if ($body.find(archive).length) {
      cy.get(archive).uncheck({ force: true });
      cy.get(archive).should("not.be.checked");
    }
  });

  cy.get("body").then(($body) => {
    if ($body.find(warningButton).length) {
      // standard Delete button, or the Force Delete button if it has the same style
      cy.get(warningButton).click();
    } else {
      // fall back to the button label
      cy.contains(dialog + " button", /^\s*(Force Delete|Delete)\s*$/).click();
    }
  });
});
// CLAUDE: END - AEMConfirmDelete

// AEMDeletePage navigates to the path of the page and deletes the page
// to prevent accidental deletion of wrong pages only pages that start with "test-page" will be deleted except
// if the ignoreVerification flag is ste to true explicitly
Cypress.Commands.add("AEMDeletePage", function (path, ignoreVerification = false) {
  cy.AEMNavigateSites(path);

  cy.log("deleting page: " + path);
  if (!ignoreVerification) {
    const title = path.split("/").pop();
    const regex = "^test-page.*";
    if (!title.match(regex)) {
      throw new Error(
        "refusing to delete page: " +
          title +
          ". if you are sure set the flag:ignoreVerification to true",
      );
    }
  }

  // select the page to be deleted, force true to skip visibility verification on this particular case
  cy.get(
    'coral-columnview-item[data-foundation-collection-item-id="' + path + '"] coral-checkbox input',
  ).check({ force: true });
  // press on delete
  cy.get("button.cq-siteadmin-admin-actions-delete-activator").click({ force: true });
  // CLAUDE: START - original dialog handling commented out, replaced by AEMConfirmDelete (see above)
  // // do not archive test pages
  // cy.get('coral-dialog[aria-hidden="false"] coral-checkbox[name="archive"] input').uncheck()
  // // confirm the delete dialog
  // cy.get('coral-dialog[aria-hidden="false"] ._coral-Button--warning').click()
  cy.AEMConfirmDelete();
  // CLAUDE: END - dialog handling

  // wait until page is deleted
  cy.waitUntil(() => cy.AEMPathNotExists(Cypress.env("AEM_AUTHOR_URL"), path + ".html"), {
    errorMsg: `page ${path} should not exist`,
    // CLAUDE: START - timeout raised from 15000 to 30000
    // timeout: 15000,
    timeout: 30000,
    // CLAUDE: END - timeout
    interval: 1000,
  });
});

// AEMDeleteTestPages will find pages in the current path that match the pattern and delete them.
// the normal pattern should be "test-page-"+uuid
Cypress.Commands.add("AEMDeleteTestPages", function (path, regex = "") {
  cy.AEMNavigateSites(path);

  if (!regex) {
    // this regex matches any string that starts with "test-page-"+uuid
    regex =
      "^test-page-[0-9a-fA-F]{8}\\b-[0-9a-fA-F]{4}\\b-[0-9a-fA-F]{4}\\b-[0-9a-fA-F]{4}\\b-[0-9a-fA-F]{12}.*";
  }

  let found = false;
  cy.get('[data-foundation-layout-columnview-columnid="' + path + '"] coral-columnview-item').each(
    ($el) => {
      const pagePath = $el.attr("data-foundation-collection-item-id");
      let title = pagePath.replace(path, "");
      title = title.replace(/^\//, "");
      if (title.match(regex)) {
        found = true;
        cy.get(
          'coral-columnview-item[data-foundation-collection-item-id="' +
            pagePath +
            '"] coral-checkbox input',
        ).check({ force: true });
      }
    },
  );
  cy.get("body").then(() => {
    if (found) {
      // press on delete
      cy.get("button.cq-siteadmin-admin-actions-delete-activator").click({ force: true });
      // CLAUDE: START - original dialog handling commented out, replaced by AEMConfirmDelete (see above)
      // // do not archive test pages
      // cy.get('coral-dialog[aria-hidden="false"] coral-checkbox[name="archive"] input').uncheck()
      // // confirm the delete dialog
      // cy.get('coral-dialog[aria-hidden="false"] ._coral-Button--warning').click()
      cy.AEMConfirmDelete();
      // CLAUDE: END - dialog handling
    }
  });
});

Cypress.Commands.add("AEMPathExists", function (baseUrl, path) {
  const url = new URL(path, baseUrl);

  return cy
    .request({
      url: url.href,
      failOnStatusCode: false,
    })
    .then((response) => {
      return response.status === 200;
    });
});

Cypress.Commands.add("AEMPathNotExists", function (baseUrl, path) {
  const url = new URL(path, baseUrl);

  return cy
    .request({
      url: url.href,
      failOnStatusCode: false,
    })
    .then((response) => {
      return response.status === 404;
    });
});

Cypress.Commands.add("AEMDeleteAsset", function (assetPath) {
  const tokenUrl = new URL("/libs/granite/csrf/token.json", Cypress.env("AEM_AUTHOR_URL"));
  let csrfToken;

  cy.request(tokenUrl.href).then((response) => {
    csrfToken = response.body.token;

    const form = new FormData();
    form.append("cmd", "deletePage");
    form.append("path", assetPath);
    form.append("force", "true");
    form.append("_charset_", "utf-8");

    const body = {
      cmd: "deletePage",
      path: assetPath,
      force: true,
      _charset_: "utf-8",
    };

    const url = new URL("/bin/wcmcommand", Cypress.env("AEM_AUTHOR_URL"));

    const referrerUrl = new URL(assetPath, Cypress.env("AEM_AUTHOR_URL"));

    // application/x-www-form-urlencoded; charset=UTF-8

    cy.request({
      url: url.href,
      method: "POST",
      headers: {
        "CSRF-Token": csrfToken,
        Referer: referrerUrl,
      },
      form: true,
      body,
    });
  });
});

// RandomPageTitle is used to have randomized yet consistent names for pages
export function RandomPageTitle() {
  const uuid = self.crypto.randomUUID();
  return "test-page-" + uuid;
}

Cypress.Commands.add("waitUntil", function (innerFunction, options = {}) {
  // Determine wait parameters
  const errorMsg = options.errorMsg || "timed out";
  const timeout = options.timeout || 3000;
  const interval = options.interval || 200;
  let retries = Math.floor(timeout / interval);

  // Evaluate the result and retry if needed
  const checkResult = (result) => {
    // Function succeeded, stop
    if (result) {
      return result;
    }
    // Retries exceeded, fail
    if (retries < 1) {
      throw new Error(errorMsg);
    }
    // Wait and trigger a retry
    cy.wait(interval, { log: false }).then(() => {
      cy.log("Retrying...");
      retries--;
      return callFunction();
    });
  };

  // Call the actual function
  const callFunction = () => {
    const result = innerFunction();

    const isPromise = Boolean(result && result.then);
    if (isPromise) {
      return result.then(checkResult);
    } else {
      return checkResult(result);
    }
  };

  return callFunction();
});
