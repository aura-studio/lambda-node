FROM public.ecr.aws/lambda/nodejs:20

WORKDIR ${LAMBDA_TASK_ROOT}

COPY lambda-node/package.json lambda-node/package-lock.json /opt/lambda-node/
COPY lambda-node/src /opt/lambda-node/src
COPY dynamic-node/package.json /opt/dynamic-node/package.json
COPY dynamic-node/src /opt/dynamic-node/src
COPY tunnel-node/package.json /opt/tunnel-node/package.json
COPY tunnel-node/src /opt/tunnel-node/src
COPY service-node/package.json /opt/service-node/package.json
COPY service-node/src /opt/service-node/src
COPY lambda-node/examples/apps/_shared examples/apps/_shared
COPY lambda-node/examples/apps/event examples/apps/event

WORKDIR ${LAMBDA_TASK_ROOT}/examples/apps/event
RUN rm -f package-lock.json \
  && node -e "const fs=require('fs'); const lp=require('/opt/lambda-node/package.json'); lp.dependencies['@aura-studio/dynamic-node']='file:/opt/dynamic-node'; fs.writeFileSync('/opt/lambda-node/package.json', JSON.stringify(lp, null, 2)); const p=require('./package.json'); p.dependencies['@aura-studio/lambda-node']='file:/opt/lambda-node'; p.dependencies['@aura-studio/service-node']='file:/opt/service-node'; p.dependencies['@aura-studio/tunnel-node']='file:/opt/tunnel-node'; fs.writeFileSync('package.json', JSON.stringify(p, null, 2));" \
  && npm install --omit=dev --package-lock=false --install-links --no-audit --no-fund

ENV NODE_PATH=/var/task/examples/apps/event/node_modules
WORKDIR ${LAMBDA_TASK_ROOT}
CMD ["examples/apps/event/src/bootstrap.handler"]
