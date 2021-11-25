# angular-app-pipeline

This project was generated with [Angular CLI](https://github.com/angular/angular-cli) version 10.1.0.
It contains a demonstration to build a fully featured GitLab pipeline.

Here is a brief description of the pipeline jobs.

## install_dependencies
Dedicated job to install node dependencies and compile Angular depencencies for Ivy. The resulting `node_modules` is cached for the next jobs and pipelines. As the cache key is one `yarn.lock` file, the job only runs when this file is modified.

All other jobs have either no cache or the pull cache policy.
This ensure the others jobs won't modify and push the cache.

## test_app
It includes first the linting step and the test step.
This job also produces tests and coverage reports.

It is volontary runned in parallel with `build_app` job because they can an their execution time is similar.

Linting step runs before tests but inside the same job.
There are multiple reasons to not parallelise with tests:
* it would use an additional runner for only a ~8 sec task
* the additionnal job would also load docker executor and cache (~25 sec)
* the pipeline will fail only after all other parrallel jobs are over 

Yet, this solution have drawbacks:
* `test_app` job is ~8 sec longer
* when the job fail it can be due to either the lint or test

Like others jobs, it uses an image from the project docker registry. The job uses a custom node image to avoid the ~30 sec overhead when installing Chrome.

## build_app
A this step, the app is build and provided through the job artifact. The result is meant to be used in `publish_image` job to publish the app as a docker image.
It's one of the slower jobs but it must be runned during all pipelines. While it can't be cached like `install_dependencies`, it should be one of the latest to run.

## build_app_gitlab
This job looks a lot like `build_app` but it adds some options to be able to deploy the app on GitLab Pages.


## publish_image
In this app scenario, there are two enviroments for deployment.
`dev` doesn't exist but it is implemented for demonstration.
`prod` do exists and leverage GitLab pages.

There is no need to build a docker image for GitLab pages as it asks for the app artifact. This job purpose is to demo how to use project docker registry.

A docker image containing the build is produced for `develop` and `master` branches as well as release tags. Only release images are tagged as latest because this is the default when pulling from the registry without specifying a tag.

Note the Dockerfile is copied during `build_app` job in app artifact. The context to build the image is keeped as light as possible.
```bash 

# Stage 0, "build-stage", based on Node.js, to build and compile the frontend
FROM node:10.8.0 as build-stage
WORKDIR /app
COPY package*.json /app/
RUN npm install
COPY ./ /app/
ARG configuration=production
RUN npm run build -- --output-path=./dist/out --configuration $configuration


# Stage 1, based on Nginx, to have only the compiled app, ready for production with Nginx
FROM nginx:1.15
#Copy ci-dashboard-dist
COPY --from=build-stage /app/dist/out/ /usr/share/nginx/html
#Copy default nginx configuration
COPY ./nginx-custom.conf /etc/nginx/conf.d/default.conf
```
![image](https://user-images.githubusercontent.com/28998255/143480875-09eb1b11-6a39-4606-9cb1-fade4b0ea84d.png)


## deploy_image
Deploy/push the docker image on a registry and trigger deployment. On a real world context it could trigger a deployment on Kubernetes.

## pages (aka deploy_prod)
Merging master don't always means deployment in production. The pipeline only activates this job when a new tag is pushed.

This job is manual, meaning the user have to run it through the UI. This is because the version is also deployed on dev environment first. It gives to the person in charge of the deployment a chance for a last check.

GitLab environments are used, so it's possible to have an overview of previous deployments.

## update_ci_images
In this scenario, this isn't a big optimisation but it saves job time for sure. All docker images used by jobs with docker executor are hosted on the project docker registry.

It's represents a very little improvment for Gitlab runner which takes ~10 sec more to pull images from docker.io registry.

For the `test_app` job, there is no docker image with chromium pre-installed. Using a node:alpine image and install it during `before_script` would slow the job by ~30 sec at each run. This is more efficient to build a complete image beforehand.

The images used by the pipeline are defined in `.ci/Dockerfile` which is a multi-stage Dockerfile for convenience. Whenever this file is changed, the pipeline adds this first job to build the images again and push them to the project docker registry. Then, the following jobs in the pipeline can use the updated images. 

# Distributing Helm Charts via the Gitlab Container Registry
Creating a Sample Chart and Setup CI
```
helm create helloworld
└── helloworld
    ├── Chart.yaml
    ├── charts
    ├── templates
    │   ├── NOTES.txt
    │   ├── _helpers.tpl
    │   ├── deployment.yaml
    │   ├── hpa.yaml
    │   ├── ingress.yaml
    │   ├── service.yaml
    │   ├── serviceaccount.yaml
    │   └── tests
    │       └── test-connection.yaml
    └── values.yaml
```
# publishing charts to a container registry
This will set up two stages for us: lint-helm-chart and release-helm-chart which will both run inside the alpine/helm docker image

```bash 
image:
  name: alpine/helm:3.2.1
  entrypoint: ["/bin/sh", "-c"]
variables:
  HELM_EXPERIMENTAL_OCI: 1
stages:
  - lint-helm-chart
  - release-helm-chart
lint-helm:
  stage: lint-helm-chart
  script:
    - helm lint alertmanager-bot
release-helm:
  stage: release-helm-chart
  script:
    - helm registry login -u $CI_REGISTRY_USER -p $CI_REGISTRY_PASSWORD $CI_REGISTRY
    - helm chart save helloworld $CI_REGISTRY/gitlabUser/helloworld:$CI_COMMIT_TAG
    - helm chart push $CI_REGISTRY/gitlabUser/helloworld:$CI_COMMIT_TAG
  only:
    - tags
    ```
    
push all of these files to our gitlab repositories and publish a new tag to trigger a push to our registry
```bash
git commit -am "initial release"
git tag v0.1.0
git push && git push --tags
```
