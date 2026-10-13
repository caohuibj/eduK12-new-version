// Actions-only fixtures. No production connection or real identities.
const {randomUUID}=require('node:crypto');
const {writeFileSync}=require('node:fs');
const {prisma}=require('./dist/config/database');
const {hashPassword}=require('./dist/utils/password');
const {generateToken}=require('./dist/utils/jwt');
const {createHuiteacherTarget,createHuiteacherEvent}=require('./dist/modules/huiteacher/evaluation.service');
const {issueHuiteacherExternalExpertInvite}=require('./dist/modules/huiteacher/expertRegistration.service');
async function main(){
 if(!new URL(process.env.DATABASE_URL).pathname.endsWith('/teacher_home_ci_test'))throw Error('isolated database required');
 const password='TeacherSynthetic!2026',passwordHash=await hashPassword(password);
 async function user(login,accountDomain='SCHOOL'){
  const id=randomUUID();
  await prisma.user.create({data:{id,username:accountDomain==='SCHOOL'?'synthetic_'+id.replaceAll('-',''):login,passwordHash,accountDomain,role:'TEACHER',teacherApproved:true}});
  if(accountDomain==='SCHOOL')await prisma.campusAccount.create({data:{userId:id,loginName:login,normalizedLogin:login}});
  return id;
 }
 const admin=await user('teacher_ci_admin'),teacher=await user('teacher_ci_member');
 const trainingUser=await user('teacher_ci_wrong_domain','TRAINING');
 const wrongDomain=await prisma.user.findUniqueOrThrow({where:{id:trainingUser}});
 if(wrongDomain.accountDomain!=='TRAINING'||await prisma.campusAccount.findUnique({where:{userId:trainingUser}}))throw Error('wrong-domain fixture must be a valid Training identity without an education account');
 const org=randomUUID();
 await prisma.organization.create({data:{id:org,name:'Synthetic Teacher CI school',productDomain:'SCHOOL',createdByUserId:admin}});
 await prisma.educationProductEntitlement.create({data:{organizationId:org,product:'HUITEACHER',status:'ACTIVE',grantedByUserId:admin}});
 for(const [id,orgRole] of [[admin,'ORG_ADMIN'],[teacher,'MEMBER']]){
  const membershipId=randomUUID();
  await prisma.organizationMembership.create({data:{id:membershipId,organizationId:org,userId:id,orgRole}});
  await prisma.organizationPersonaGrant.create({data:{id:randomUUID(),organizationId:org,membershipId,persona:'TEACHER',grantedByUserId:admin}});
  if(id===admin)await prisma.educationProductRoleGrant.create({data:{id:randomUUID(),organizationId:org,membershipId,product:'HUITEACHER',role:'PRODUCT_ADMIN',grantedByUserId:admin}});
 }
 const target=await createHuiteacherTarget({organizationId:org,actorUserId:admin,kind:'ORGANIZATION',name:'Synthetic CI school'});
 const event=await createHuiteacherEvent({organizationId:org,actorUserId:admin,targetId:target.id,kind:'CLASSROOM',title:'Synthetic classroom observation'});
 const invite=await issueHuiteacherExternalExpertInvite({organizationId:org,actorUserId:admin,eventId:event.id});
 const actualTeacher=await prisma.user.findUniqueOrThrow({where:{id:teacher}});
 const schoolToken=generateToken({userId:teacher,username:'teacher_ci_member',role:'TEACHER',tokenVersion:actualTeacher.tokenVersion,accountDomain:'SCHOOL',sessionProduct:'HUISCHOOL'});
 writeFileSync('/app/.local/teacher-home-fixture.json',JSON.stringify({password,org,event:event.id,invite:invite.inviteCode,schoolToken}),{mode:0o600});
 await prisma.$disconnect();
}
main().catch(async e=>{console.error(e);await prisma.$disconnect();process.exitCode=1;});
